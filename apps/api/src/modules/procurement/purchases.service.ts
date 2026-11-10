import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type {
  CustodyCap, NewPurchase, PostPurchase, ProcurementOverview, PurchaseDecision, PurchaseFilters, PurchaseStatusKey, PurchasesView, PurchaseView, SettlePurchase,
} from "@places/contracts";
import { type Approver, type Piasters, approvalProblem, attachmentProblem, formatEGP, fromDecimal, overBudget, toDecimal } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { FilesService } from "../../core/files/files.service";
import { EXPORT_LIMIT } from "../../core/http/excel";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { LedgerService } from "../finance/ledger.service";
import { VouchersService } from "../finance/vouchers.service";
import { SettingsService } from "../settings/settings.service";
import { PurchasesRepository, type PurchaseRow, type Scope } from "./purchases.repository";
import { blankHidden, notYours } from "../finance/hidden-fields";

const MODULE = "procurement";
const LINK = "/procurement";
const NOT_FOUND = "الطلب ده مش موجود";
const H48 = 48 * 3_600_000; // KPI M-12: purchase and repair done within 48 hours
const dec = (v: { toFixed(n: number): string }): Piasters => fromDecimal(v.toFixed(2));
const code = (no: number) => `PR-${no}`;

/** M-09 field permissions: what the person may not see / change on a request. */
const hidden = (me: CurrentUser) => me.fields.hidden(MODULE);
const fixed = (me: CurrentUser) => me.fields.fixed(MODULE);
/** Filtering by a hidden field would tell its value: such a filter is dropped. */
function shownFilters(f: PurchaseFilters, h: ReadonlySet<string>): PurchaseFilters {
  const { accountId, group, vendor, ...rest } = f;
  return { ...rest, ...(accountId && !h.has("account") ? { accountId } : {}), ...(group && !h.has("account") ? { group } : {}), ...(vendor && !h.has("vendor") ? { vendor } : {}) };
}

/**
 * M-08 · purchase requests. Mokhtar asks → an approver releases it within his limit (Q44 · Q45, never his own: 4.1) →
 * Mokhtar settles it and tells finance which safe he paid from («اتسوّى»; a different amount goes back for approval,
 * 2.3) → finance posts it with a payment voucher (VouchersService.recordExpense, same transaction). Procurement never
 * moves a balance (4 Nov meeting); the line's budget only moves with that voucher (Q46).
 */
@Injectable()
export class PurchasesService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: PurchasesRepository,
    private readonly vouchers: VouchersService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 4.1: approvers, finance and management see every request; procurement its own. */
  private scope(me: CurrentUser): Scope {
    return me.grants.scope === "all" ? {} : { createdById: me.id };
  }

  private async approver(me: CurrentUser): Promise<Approver | null> {
    if (!me.grants.can("procurement", "approve")) return null;
    const big = (await this.settings.all()).procurementBigApprovers;
    return { id: me.id, management: me.roles.includes("admin"), aboveLimit: big.includes(me.email.toLowerCase()) };
  }

  /** What is left in each line's budget now, read from the same numbers as finance's budget page. */
  private async budgetLeft(): Promise<Map<string, Piasters>> {
    const { rows } = await this.vouchers.budget();
    return new Map(rows.filter((r) => r.active && r.left !== null).map((r) => [r.accountId, fromDecimal(r.left!)]));
  }

  private async views(rows: PurchaseRow[], who: Approver | null, left: Map<string, Piasters>): Promise<PurchaseView[]> {
    const [names, files] = await Promise.all([
      this.repo.names([...new Set(rows.flatMap((r) => [r.createdById, r.decidedById ?? ""]))]),
      this.files.names(rows.flatMap((r) => r.attachments)),
    ]);
    const name = (id: string | null) => (id ? names.find((n) => n.userId === id)?.name ?? "" : null);
    return rows.map((r) => {
      const amount = dec(r.amount), budgetLeft = left.get(r.accountId) ?? null;
      const req = { amount, createdById: r.createdById, budgetLeft };
      return {
        id: r.id, no: code(r.no), item: r.item, amount: toDecimal(amount), account: r.account, vendor: r.vendor,
        attachments: r.attachments.map((id) => ({ id, name: files.find((f) => f.id === id)?.name ?? "" })),
        status: r.status as PurchaseStatusKey, createdBy: { id: r.createdById, name: name(r.createdById) ?? "" }, createdAt: r.createdAt.toISOString(),
        decidedBy: name(r.decidedById), decidedAt: r.decidedAt?.toISOString() ?? null, rejectReason: r.rejectReason,
        paidFrom: r.paidFrom, settledAt: r.settledAt?.toISOString() ?? null, postedAt: r.postedAt?.toISOString() ?? null,
        move: r.move && { id: r.move.id, no: `MV-${r.move.no}` },
        budgetLeft: budgetLeft === null ? null : toDecimal(budgetLeft),
        overBudget: r.status === "Pending" && overBudget(req),
        blocker: r.status === "Pending" && who ? approvalProblem(req, who) : null,
      };
    });
  }

  async list(me: CurrentUser, f: PurchaseFilters): Promise<PurchasesView> {
    const [[rows, total], who, left] = await Promise.all([this.repo.list(shownFilters(f, hidden(me)), this.scope(me)), this.approver(me), this.budgetLeft()]);
    return blankHidden({ items: await this.views(rows, who, left), total, page: f.page, pageSize: f.pageSize }, hidden(me));
  }

  /** «تصدير الطلبات» (demo procurement.js · M-12 0.11): every request the filters match, in the reader's scope (4.1). */
  async exportRows(me: CurrentUser, f: PurchaseFilters): Promise<PurchaseView[]> {
    const [rows] = await this.repo.list({ ...shownFilters(f, hidden(me)), page: 1, pageSize: EXPORT_LIMIT }, this.scope(me));
    await this.audit.record({ module: MODULE, entity: "Purchase", entityId: "export", action: "export", userId: me.id, after: { filters: f, rows: rows.length } });
    return blankHidden(await this.views(rows, null, new Map()), hidden(me));
  }

  async get(me: CurrentUser, id: string): Promise<PurchaseView> {
    const row = await this.repo.find(id, this.scope(me));
    if (!row) throw new NotFoundException(NOT_FOUND);
    return blankHidden((await this.views([row], await this.approver(me), await this.budgetLeft()))[0]!, hidden(me));
  }

  /** The KPI tiles, the budget per line (10.3 report), the safes with their ceilings, and the 48-hour KPI. */
  async overview(me: CurrentUser): Promise<ProcurementOverview> {
    const scope = this.scope(me);
    const [counts, budget, cash, caps, times] = await Promise.all([this.repo.counts(scope), this.vouchers.budget(), this.vouchers.cash(), this.ledger.caps(), this.repo.settledTimes(scope)]);
    const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
    const groups = new Map(budget.rows.map((r) => [r.code.slice(0, 2), r.group]));
    // a hidden «المبلغ»: what the lines spent (the posted requests are in it) and the safes' balances go blank too
    return blankHidden({
      pending: count("Pending"), approved: count("Approved"),
      lines: budget.rows.map((r) => ({ accountId: r.accountId, code: r.code, name: r.name, group: r.group, budget: r.active ? r.budget : null, spent: r.spent, left: r.active ? r.left : null, pct: r.pct, level: r.level })),
      groups: [...groups].map(([c, name]) => ({ code: c, name })),
      totals: { budget: budget.totals.budget, spent: budget.totals.spent, left: budget.totals.left },
      cash: cash.accounts.map((a) => ({ accountId: a.id, code: a.code, name: a.name, balance: a.balance, cap: caps.get(a.id) ?? null })),
      in48: { done: times.filter((t) => t.settledAt!.getTime() - t.createdAt.getTime() <= H48).length, total: times.length },
    }, hidden(me));
  }

  async create(me: CurrentUser, given: NewPurchase): Promise<PurchaseView> {
    // a read-only «المبلغ» / «البند» can't be set (the request needs both); a read-only «المورد» starts empty
    const f = fixed(me);
    if (f.has("amount")) throw notYours("المبلغ");
    if (f.has("account")) throw notYours("البند");
    const { vendor, ...rest } = given;
    const input: NewPurchase = vendor && !f.has("vendor") ? { ...rest, vendor } : rest;
    const amount = fromDecimal(input.amount);
    const { rows } = await this.vouchers.budget();
    if (!rows.some((r) => r.accountId === input.accountId)) throw new BadRequestException("اختار البند من شجرة الحسابات (مصروف فرعي)");
    const missing = attachmentProblem(amount, new Set(input.attachments).size);
    if (missing) throw new BadRequestException(missing);
    const row = await this.db.$transaction(async (tx) => {
      const p = await this.repo.create({ item: input.item, amount: input.amount, accountId: input.accountId, vendor: input.vendor || null, attachments: [...new Set(input.attachments)], createdById: me.id }, tx);
      await this.files.attach(me, input.attachments, "Purchase", p.id, tx);
      await this.audit.record({ module: MODULE, entity: "Purchase", entityId: p.id, action: "create", userId: me.id,
        after: { no: code(p.no), item: p.item, amount: input.amount, account: p.account.code, vendor: p.vendor, attachments: p.attachments.length } }, tx);
      return p;
    });
    await this.notifications.notify({ event: "procurement.request", text: `طلب شراء جديد: ${row.item} · ${formatEGP(amount)}`, link: LINK });
    return blankHidden((await this.views([row], null, await this.budgetLeft()))[0]!, hidden(me));
  }

  async decide(me: CurrentUser, id: string, d: PurchaseDecision): Promise<PurchaseView> {
    const p = await this.repo.find(id, {});
    if (!p) throw new NotFoundException(NOT_FOUND);
    if (p.status !== "Pending") throw new ConflictException("الطلب ده اتاخد فيه قرار قبل كده");
    if (d.decision === "Approved") {
      const problem = approvalProblem({ amount: dec(p.amount), createdById: p.createdById, budgetLeft: (await this.budgetLeft()).get(p.accountId) ?? null }, (await this.approver(me))!);
      if (problem) throw new ForbiddenException(problem);
    }
    await this.db.$transaction(async (tx) => {
      const data = { status: d.decision, decidedById: me.id, decidedAt: new Date(), rejectReason: d.decision === "Rejected" ? (fixed(me).has("rejectReason") ? "" : d.reason!) : null };
      if (!(await this.repo.move(id, { status: "Pending", amount: p.amount.toFixed(2) }, data, tx))) throw new ConflictException("الطلب اتغير · افتحه تاني");
      await this.audit.record({ module: MODULE, entity: "Purchase", entityId: id, action: d.decision === "Approved" ? "approve" : "reject", userId: me.id,
        before: { status: "Pending" }, after: { status: d.decision, amount: p.amount.toFixed(2), reason: data.rejectReason } }, tx);
    });
    const text = d.decision === "Approved" ? `${p.item}: اتوافق عليه · جاهز للصرف` : `${p.item}: اترفض · ${d.reason}`;
    await this.notifications.notify({ event: "procurement.decided", text, link: LINK, userIds: [p.createdById] });
    return this.get(me, id);
  }

  /**
   * «اتسوّى · ابعته للمالية»: procurement says it paid and from which safe; nothing moves until finance posts it.
   * A different amount than the approved one goes back to Pending for a new approval (2.3).
   */
  async settle(me: CurrentUser, id: string, given: SettlePurchase): Promise<PurchaseView> {
    const p = await this.repo.find(id, this.scope(me));
    if (!p) throw new NotFoundException(NOT_FOUND);
    // no amount, or a read-only «المبلغ»: settled at the approved amount
    const s = { ...given, amount: fixed(me).has("amount") || !given.amount ? p.amount.toFixed(2) : given.amount };
    if (p.status !== "Approved") throw new ConflictException("الطلب لازم يكون اتوافق عليه الأول");
    const cash = (await this.vouchers.cash()).accounts.find((a) => a.id === s.paidFromId);
    if (!cash) throw new BadRequestException("اختار الخزنة أو البنك اللي اتدفع منه");
    const amount = fromDecimal(s.amount), changed = amount !== dec(p.amount);
    const attachments = [...new Set([...p.attachments, ...s.attachments])];
    const missing = attachmentProblem(amount, attachments.length);
    if (missing) throw new BadRequestException(missing);
    await this.db.$transaction(async (tx) => {
      const data = changed
        ? { amount: s.amount, status: "Pending", decidedById: null, decidedAt: null, remindedAt: null, attachments }
        : { status: "Settled", paidFromId: cash.id, settledById: me.id, settledAt: new Date(), attachments };
      if (!(await this.repo.move(id, { status: "Approved", amount: p.amount.toFixed(2) }, data, tx))) throw new ConflictException("الطلب اتغير · افتحه تاني");
      await this.files.attach(me, s.attachments.filter((f) => !p.attachments.includes(f)), "Purchase", id, tx);
      await this.audit.record({ module: MODULE, entity: "Purchase", entityId: id, action: changed ? "update" : "settle", userId: me.id,
        before: { status: "Approved", amount: p.amount.toFixed(2) }, after: { status: data.status, amount: s.amount, paidFrom: cash.code } }, tx);
    });
    if (changed) await this.notifications.notify({ event: "procurement.request", text: `${p.item}: المبلغ اتغير وقت الدفع · محتاج موافقة تاني`, link: LINK });
    else await this.notifications.notify({ event: "procurement.settled", text: `طلب شراء ${code(p.no)} (${p.item}) اتسوّى بـ ${formatEGP(amount)} · مستني تصرفه من الخزنة`, link: "/finance" });
    return this.get(me, id);
  }

  /** «طلبات مشتريات مستنية الصرف» for finance. */
  async settled(me: CurrentUser): Promise<PurchaseView[]> {
    return blankHidden(await this.views(await this.repo.settled(), null, new Map()), hidden(me));
  }

  /** Finance «اصرفها»: one payment voucher for the request's amount on its line, in the same transaction (10.2 → 9.3). */
  async post(me: CurrentUser, id: string, input: PostPurchase) {
    const res = await this.db.$transaction(async (tx) => {
      const p = await this.repo.find(id, {}, tx);
      if (!p) throw new NotFoundException(NOT_FOUND);
      if (p.status !== "Settled") throw new ConflictException(p.status === "Posted" ? "الطلب ده اترحّل قبل كده" : "الطلب لسه مااتسوّاش");
      const saved = await this.vouchers.recordExpense(me, {
        fromId: input.fromId, accountId: p.accountId, amount: p.amount.toFixed(2), party: p.vendor || p.item, ref: code(p.no), memo: p.item, ...(input.date ? { date: input.date } : {}),
      }, tx);
      const data = { status: "Posted", moveId: saved.move.id, postedById: me.id, postedAt: new Date() };
      if (!(await this.repo.move(id, { status: "Settled" }, data, tx))) throw new ConflictException("الطلب ده اترحّل قبل كده");
      await this.audit.record({ module: MODULE, entity: "Purchase", entityId: id, action: "post", userId: me.id,
        before: { status: "Settled" }, after: { status: "Posted", move: saved.move.no, from: saved.move.from?.name ?? null, amount: p.amount.toFixed(2) } }, tx);
      return { p, saved };
    });
    await this.notifications.notify({ event: "procurement.decided", text: `المالية رحّلت ${code(res.p.no)} (${res.p.item}) · ${res.saved.move.no}`, link: LINK, userIds: [res.p.createdById] });
    await this.vouchers.tellBudgetCrossed(res.saved.crossed); // 9.9: a purchase is a payment on its line like any other
    return res.saved;
  }

  /** A request's attachment, for whoever may see the request. */
  async file(me: CurrentUser, id: string, fileId: string) {
    const p = await this.repo.find(id, this.scope(me));
    if (!p || !p.attachments.includes(fileId)) throw new NotFoundException("الملف مش موجود");
    return this.files.downloadUrl(fileId);
  }

  setCap(me: CurrentUser, c: CustodyCap) {
    return this.db.$transaction((tx) => this.ledger.setCap(me, c.accountId, c.cap, tx));
  }
}
