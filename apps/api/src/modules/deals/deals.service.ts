import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CancelDeal, CollectDeal, CreateDeal, EditCollection, DealCollected, DealDetail, DealExecution, DealFilters, DealForm, DealNote, DealPapers, DealRow, DealUnit, Paged, ReviewDeal } from "@places/contracts";
import { ACCRUED_PARENT, EXTERNAL_COMMISSION_DUE_NAME, EXTERNAL_COMMISSION_EXPENSE, OPS_COMMISSION_DUE, OPS_COMMISSION_EXPENSE, directCostLines, directCosts, CLIENTS_PARENT, SALES_COMMISSION_EXPENSE, SALES_COMMISSION_PARENT, TL_COMMISSION_EXPENSE, tlAdjustment, type DealMoney, type DealStatus, type DealType, type EntryLine, cancelProblem, changes, collected, collectionEditProblem, collectionProblem, collectionStatus, localDate, remaining, revenueOnCollection, splitDeal, closedTooSoon, dealCode, dealSides, executeProblem, expectsCommission, papersProblem, formatEGP, fromDecimal, reviewProblem, ruleRecipients, signProblem, takesNote, tcrCode, toDecimal, type Piasters } from "@places/domain";
import { esc, layout } from "../../core/documents/documents.service";
import { DocumentsSetupService } from "../settings/documents-setup.service";
import { SettingsService } from "../settings/settings.service";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { LeadsService } from "../leads/leads.service";
import { InventoryService } from "../inventory/inventory.service";
import { UnitsService } from "../inventory/units.service";
import { LeadRulesService } from "../leads/lead-rules.service";
import { LedgerService } from "../finance/ledger.service";
import { VouchersService } from "../finance/vouchers.service";
import { TargetsService } from "../kpis/targets.service";
import { type DealRecord, type DealRowRecord, DealsRepository } from "./deals.repository";
import { hideDetail, hideRow, mayChange } from "./deal-fields";

/** Out of scope or gone: the same answer, so it doesn't tell whether the deal exists. */
const NO_DEAL = "الصفقة دي مش موجودة";
const NOT_SALES = "اختار سيلز من القايمة";
const NO_TCR = "الـ TCR دي مش موجودة";
/** Only the number is left-to-right: «ج.م» inside an LTR run would come out as «م.ج» (core/documents). */
const egp = (p: Piasters) => `<span class="num">${(p / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span> ج.م`;
/** PENDING_REVIEW ↔ «Pending Review»: the API speaks the statuses the team uses (M-02 3.3). */
const toDb = (s: DealStatus) => s.toUpperCase().replace(/ /g, "_");
const label = (s: string) => s.split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ") as DealStatus;
const link = (id: string) => `/deals?open=${id}`;
/** A @db.Date column as its calendar day. */
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
/**
 * «note» (M-02 3.1): the Office Manager (her review right, «deals: approve») or Finance («finance: edit») — not whoever
 * else holds «deals: edit», like the Sales Director (4.1: «يتابع ويراجع»).
 */
export const writesNote = (me: CurrentUser) => me.grants.can("deals", "approve") || me.grants.can("finance", "edit");

/**
 * M-02 · the Done Deal from the salesperson's registration to the Office Manager's approval (2.1 steps 1 · 5 · 6, Q9).
 * Collections, commissions, the Seller's approval by Manar and closing the unit come with their own tasks (5.3–5.5).
 */
@Injectable()
export class DealsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: DealsRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly leads: LeadsService,
    private readonly inventory: InventoryService,
    private readonly rules: LeadRulesService,
    private readonly ledger: LedgerService,
    private readonly vouchers: VouchersService,
    private readonly letterhead: DocumentsSetupService,
    private readonly targets: TargetsService,
    private readonly settings: SettingsService,
    private readonly unitLocks: UnitsService,
  ) {}

  /** M-02 4.1: a salesperson sees the deals they are on, a TL their team's, the managers all of them. */
  private scope(me: CurrentUser): Prisma.DealWhereInput {
    const own = ownedBy(me, "employeeId");
    return Object.keys(own).length ? { participants: { some: own } } : {};
  }

  async list(me: CurrentUser, f: DealFilters): Promise<Paged<DealRow>> {
    const hidden = me.fields.hidden("deals");
    const [rows, total] = await this.repo.list(this.scope(me), f, f.status && toDb(f.status), !hidden.has("location"));
    return { items: rows.map((r) => hideRow(toRow(r), hidden)), total, page: f.page, pageSize: f.pageSize };
  }

  async get(me: CurrentUser, id: string): Promise<DealDetail> {
    const d = await this.repo.detail(this.scope(me), id);
    if (!d) throw new NotFoundException(NO_DEAL);
    return hideDetail(toDetail(d, d.reviewedById ? await this.repo.userName(d.reviewedById) : null), me.fields.hidden("deals"));
  }

  /** M-11 2.1: the deal a contract is uploaded on — in the caller's scope and on the sheet (approved, collected or not). */
  async forContract(me: CurrentUser, id: string) {
    const d = await this.repo.detail(this.scope(me), id);
    return d && takesNote(label(d.status)) ? { id: d.id, code: d.code, company: d.company, unitId: d.unit.id, unitCode: d.unit.code } : null;
  }

  /** «عقد جديد» (M-11): the caller's approved deals with no contract yet. */
  async contractable(me: CurrentUser) {
    const rows = await this.repo.contractable(this.scope(me), ["APPROVED", "PARTIALLY_COLLECTED", "FULLY_COLLECTED"]);
    return rows.map((d) => ({ id: d.id, code: d.code, company: d.company, unitCode: d.unit.code }));
  }

  /** «سجّل صفقة»: the caller's leads (with their company, 4 Nov meeting) and the salespeople for «حد معاك في الديل Buyer؟». */
  async form(me: CurrentUser): Promise<DealForm> {
    const [leads, salespeople] = await Promise.all([this.leads.dealLeads(me), this.repo.salespeople()]);
    // a lead pulled to the Draft shows in its own group; «كان عند …» only when it wasn't the caller's (demo deals.js dealNew)
    const from = await this.names(leads.map((l) => l.drafts[0]?.fromId).filter((x): x is string => !!x && x !== me.employeeId));
    return { leads: leads.map((l) => {
      const stay = l.draft === "draft" ? l.drafts[0] : undefined;
      return { id: l.id, code: l.code, name: l.name, company: l.company?.name ?? null,
        draft: stay ? { from: stay.fromId && stay.fromId !== me.employeeId ? from.get(stay.fromId) ?? null : null } : null };
    }), salespeople };
  }

  /** The unit picker follows the inventory's field rules (M-09): a hidden space or agent isn't sent, nor matched by the search. */
  async units(me: CurrentUser, q?: string): Promise<DealUnit[]> {
    const hidden = me.fields.hidden("inventory");
    const bySpace = !!q && /^\d+$/.test(q) && hidden.has("space");
    const units = (await this.inventory.forDeal(q)).filter((u) => !bySpace || [u.code, u.project].some((x) => x.toLowerCase().includes(q.toLowerCase())));
    const names = hidden.has("agent") ? new Map<string, string>() : await this.names(units.map((u) => u.agentId).filter((x): x is string => !!x));
    return units.map((u) => ({
      id: u.id, code: u.code, project: u.project, space: hidden.has("space") ? 0 : u.space, type: u.type,
      agent: u.agentId && !hidden.has("agent") ? { id: u.agentId, name: names.get(u.agentId) ?? "" } : null,
    }));
  }

  /**
   * 2.1 steps 1 · 5 · 9: the salesperson registers the deal the day it closes. Company and source come from the lead,
   * the location and the Seller (the unit's agent, waiting for Manar) from the unit. It waits for the Office Manager (Q9).
   */
  async create(me: CurrentUser, sheet: CreateDeal): Promise<DealDetail> {
    // M-09: what the person may not set starts empty (the commissions) or as the unit has it (type, space)
    const fixed = me.fields.fixed("deals");
    const owner = fixed.has("commissionOwner") ? 0 : fromDecimal(sheet.commissionOwner), client = fixed.has("commissionClient") ? 0 : fromDecimal(sheet.commissionClient);
    if (!expectsCommission(owner, client)) throw new BadRequestException("اكتب العمولة المتوقعة من الـ Owner أو الـ Client");
    const [lead] = await this.leads.dealLeads(me, sheet.leadId);
    if (!lead) throw new NotFoundException("الليد ده مش موجود أو مبقاش معاك");
    const unit = await this.inventory.openForDeal(sheet.unitId);
    if (!unit) throw new BadRequestException("الوحدة دي مش متاحة · اختار من القايمة");
    const input: CreateDeal = {
      ...sheet,
      ...(fixed.has("type") ? { type: unit.type as DealType } : {}),
      ...(fixed.has("space") ? { space: me.fields.hidden("inventory").has("space") ? 0 : unit.space } : {}),
    };
    const stay = lead.draft === "draft" ? lead.drafts[0] : undefined;
    // a lead in the Draft is closed by the salesperson it was pulled from (demo: «me = l.draft.from»)
    const closer = stay?.fromId ?? lead.assignedToId ?? me.employeeId;
    if (!closer) throw new BadRequestException("الليد ده مش مع سيلز");
    const { buyers, sellers } = dealSides(closer, input.withMe, unit.agentId);
    if ((await this.repo.salespeople(input.withMe)).length !== new Set(input.withMe).size) throw new BadRequestException(NOT_SALES);
    const company = lead.company?.name ?? lead.name;
    const closedAt = new Date();
    const { close } = await this.rules.get();
    const offTarget = closedTooSoon(lead.createdAt, closedAt, close.alarmH); // Q13 · 5.6

    const created = await this.db.$transaction(async (tx) => {
      const [{ n }] = (await this.repo.nextCode(tx)) as [{ n: bigint }];
      const code = dealCode(n);
      const data = {
        code, leadId: lead.id, unitId: unit.id, type: input.type, space: input.space, location: unit.project, company, source: lead.channel,
        commissionOwner: toDecimal(owner), commissionClient: toDecimal(client), closedAt, offTarget, createdById: me.id,
      };
      const deal = await this.repo.create(tx, {
        ...data,
        participants: { create: [...buyers.map((employeeId) => ({ employeeId, side: "BUYER" as const })), ...sellers.map((employeeId) => ({ employeeId, side: "SELLER" as const, approved: false }))] },
      });
      await this.audit.record({ module: "deals", entity: "Deal", entityId: deal.id, action: "create", userId: me.id, after: { ...data, buyers, sellers } }, tx);
      const back = stay ? await this.leads.backFromDraft(tx, me, lead, code) : null;
      await this.leads.markDoneDeal(tx, me, lead, `اتسجّلت صفقة ${code} على ${unit.code}`);
      return { id: deal.id, code, back };
    });
    if (created.back) await this.leads.notifyBackFromDraft(lead, created.back, created.code);
    // who hears of a new Done Deal and on which channels is «قواعد الليدز ← الإقفال» (1.29), like the demo
    const holder = await this.repo.account(closer);
    const to = ruleRecipients(close.notify, { ownerUserId: holder?.userId ?? null, ownerTlUserId: holder?.teamLeader?.userId ?? null });
    const alarm = offTarget ? `Alarm: اتسجّلت وقت القفل (اتعملت واتقفلت في خلال ${close.alarmH} ساعة) · متدخلش في التارجت · ` : "";
    await this.notifications.notify({ event: "deal.done", link: link(created.id), to, channels: [...close.notify.ch], text: `${alarm}Done Deal جديدة ${created.code} مستنية مراجعتك · ${company}` });
    return this.get(me, created.id);
  }

  /**
   * Q9: the Office Manager reviews the Done Deal once. She may correct any field first (every change audited old →
   * new); approving puts it on the done-deals sheet and tells the accountant to collect, rejecting sends it back to
   * the salespeople with the reason.
   */
  async review(me: CurrentUser, id: string, sheet: ReviewDeal): Promise<DealDetail> {
    // M-09: a field she may not change keeps its stored value (the form sends them all)
    const fixed = me.fields.fixed("deals");
    const input: ReviewDeal = Object.fromEntries(Object.entries(sheet).filter(([k]) => !fixed.has(k))) as ReviewDeal;
    let lockNotify: (() => Promise<unknown>) | undefined;
    const result = await this.db.$transaction(async (tx) => {
      const d = await this.repo.detail(this.scope(me), id, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      const problem = reviewProblem(label(d.status), input.decision, input.reason);
      if (problem) throw new BadRequestException(problem);
      const reviewed = { reviewedById: me.id, reviewedAt: new Date() };
      if (input.decision === "reject") {
        await this.repo.update(tx, id, { status: "REJECTED", reviewNote: input.reason!, ...reviewed });
        await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "reject", userId: me.id, before: { status: d.status }, after: { status: "REJECTED", reason: input.reason } }, tx);
        return d;
      }
      const edits = await this.corrections(d, input);
      const { buyers, ...fields } = edits?.after ?? {};
      await this.repo.update(tx, id, { status: "APPROVED", ...reviewed, ...fields });
      if (buyers) await this.repo.setBuyers(tx, id, buyers as string[]);
      await this.clientAccount(tx, me, d); // 9.12: the client's own account under 113 opens with the approval
      // 5.5 · M-02 6.2 · Q16: the approved deal locks its unit's side; Manar (Rent) / Randa (Resale, Income) confirm the close
      lockNotify = (await this.unitLocks.lock(d.unit.id, id, { type: (input.type ?? d.type) as DealType, userId: me.id }, tx)).notify;
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "approve", userId: me.id,
        before: { status: d.status, ...edits?.before }, after: { status: "APPROVED", ...edits?.after } }, tx);
      return d;
    });
    await lockNotify?.(); // «أكّد قفل الوحدة» for Manar / Randa, now that the approval is committed
    await this.announce(result, input);
    return this.get(me, id);
  }

  /**
   * «note» (M-02 3.1 · 2.3): the Office Manager or Finance write a special case on a deal on the sheet; a different
   * amount (targetBase) changes what enters the targets only, never the commission (commission.ts splitDeal).
   */
  async setNote(me: CurrentUser, id: string, input: DealNote): Promise<DealDetail> {
    // M-02 3.1 names the Office Manager and Finance; the Sales Director holds «deals: edit» but only «يتابع ويراجع» (4.1)
    if (!writesNote(me)) throw new ForbiddenException("الـ note بيكتبها الـ Office Manager أو المالية بس");
    await this.db.$transaction(async (tx) => {
      const d = await this.repo.detail(this.scope(me), id, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      if (!takesNote(label(d.status))) throw new BadRequestException("الـ note بتتكتب على صفقة اتوافق عليها بس");
      // M-09: the note / its amount the person may not change keep what's stored
      const fixed = me.fields.fixed("deals");
      const next = {
        note: fixed.has("note") ? d.note : input.note || null,
        targetBase: fixed.has("targetBase") ? d.targetBase?.toFixed(2) ?? null : input.targetBase && toDecimal(fromDecimal(input.targetBase)),
      };
      const diff = changes({ note: d.note, targetBase: d.targetBase?.toFixed(2) ?? null }, next);
      if (!diff) return;
      await this.repo.update(tx, id, next);
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "note", userId: me.id, ...diff }, tx);
    });
    return this.get(me, id);
  }

  /**
   * M-02 3.1 «ميعاد تنفيذ الصفقة» (Office Manager) for KPI 2202 (the worker's dealExec): the due date, and «اتنفذت»
   * recorded once as today's Cairo date. Both audited old → new.
   */
  async setExecution(me: CurrentUser, id: string, input: DealExecution): Promise<DealDetail> {
    mayChange(me.fields.fixed("deals"), "execution");
    await this.db.$transaction(async (tx) => {
      const d = await this.repo.detail(this.scope(me), id, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      if (input.executed) {
        const problem = executeProblem(label(d.status), !!d.executedAt);
        if (problem) throw new BadRequestException(problem);
      } else if (!takesNote(label(d.status))) throw new BadRequestException("ميعاد التنفيذ بيتحدد على صفقة اتوافق عليها بس");
      const now = { execDueAt: day(d.execDueAt), executedAt: day(d.executedAt) };
      const next = { execDueAt: input.execDueAt, executedAt: input.executed ? localDate(new Date()) : undefined };
      const diff = changes(now, next);
      if (!diff) return;
      await this.repo.update(tx, id, {
        ...(next.execDueAt ? { execDueAt: new Date(`${next.execDueAt}T00:00:00Z`) } : {}),
        ...(next.executedAt ? { executedAt: new Date(`${next.executedAt}T00:00:00Z`) } : {}),
      });
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "execution", userId: me.id, ...diff }, tx);
    });
    return this.get(me, id);
  }

  /**
   * M-02 3.1 «مراجعة أوراق الصفقة (عقد، تفويض، تسجيل)» (Finance) for KPI «صفر أخطاء» (the worker's paperErrors).
   * A later review replaces the earlier one (audited); an error tells the Office Manager, like the demo.
   */
  async setPapers(me: CurrentUser, id: string, input: DealPapers): Promise<DealDetail> {
    mayChange(me.fields.fixed("deals"), "papers");
    const d = await this.db.$transaction(async (tx) => {
      const d = await this.repo.detail(this.scope(me), id, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      const problem = papersProblem(label(d.status), input.ok, input.note);
      if (problem) throw new BadRequestException(problem);
      const next = { papersOk: input.ok, papersNote: input.ok ? null : input.note!.trim() };
      const diff = changes({ papersOk: d.papersOk, papersNote: d.papersNote }, next);
      if (!diff) return null;
      await this.repo.update(tx, id, next);
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "papers", userId: me.id, ...diff }, tx);
      return d;
    });
    if (d && !input.ok) await this.notifications.notify({ event: "deal.papers", link: link(id), text: `أوراق ${d.code} فيها خطأ: ${input.note!.trim()}` });
    return this.get(me, id);
  }

  /**
   * «سجّل تحصيل» (5.3, the accountant's meeting 4 Nov): a receive voucher (9.11) into the chosen safe / bank against
   * the client's account (113…). The first collection books Places' whole commission as revenue (Q37–Q39), so the
   * client's account = commission − collected. Fully collected: each salesperson's commission becomes due under 21103.
   */
  async collect(me: CurrentUser, id: string, input: CollectDeal): Promise<DealCollected> {
    mayChange(me.fields.fixed("deals"), "collected"); // a collection changes what's collected (M-09)
    const amount = fromDecimal(input.amount);
    const lines = await this.vouchers.commissionLines();
    const { result, signers } = await this.db.$transaction(async (tx) => {
      await this.repo.lock(tx, id); // then read: the status must be the one after any collection running right now
      const d = await this.repo.detail(this.scope(me), id, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      const money = toMoney(d, await this.repo.payments(tx, id));
      const problem = collectionProblem(money, amount);
      if (problem) throw new BadRequestException(problem);
      const date = input.date ?? localDate(new Date());
      const client = await this.clientAccount(tx, me, d);
      const revenue = revenueOnCollection(money);
      if (revenue) {
        const line = lines.find((l) => l.id === input.revenueId);
        if (!line) throw new BadRequestException("اختار نوع الإيراد (عمولات تسويق عقاري …) · أول تحصيل بيثبت العمولة كلها إيراد");
        await this.ledger.post(me, { date, nature: "إثبات إيراد عمولة", source: "deal", sourceId: id, memo: `عمولة ${d.code} · ${d.company}`,
          lines: [{ accountId: client.id, debit: revenue, credit: 0 }, { accountId: line.id, debit: 0, credit: revenue }] }, tx);
        await this.directCostsDue(tx, me, d, revenue, date);
      }
      const from = input.side === "owner" ? "من الـ Owner" : "من الـ Client";
      const saved = await this.vouchers.recordDealCollection(me, { toId: input.toId, clientAccountId: client.id, amount: input.amount, party: d.company, ref: d.code, memo: `تحصيل عمولة ${d.code} ${from}`, date }, tx);
      const payment = await this.repo.addPayment(tx, { dealId: id, side: input.side, amount: toDecimal(amount), receivedAt: new Date(`${date}T00:00:00Z`), accountId: input.toId, recordedById: me.id, moveId: saved.move.id });
      // 5.12 (M-02 2.3 · 3.2): every collection makes a new TCR on the same deal code, for each salesperson on it to sign
      const [{ n }] = (await this.repo.nextTcr(tx)) as [{ n: bigint }];
      const signers = [...money.buyers, ...money.sellers];
      await this.repo.addTcr(tx, { code: Number(n), dealId: id, paymentId: payment.id, signers });
      const after: DealMoney = { ...money, payments: [...money.payments, { side: input.side, amount }] };
      const status = collectionStatus(after);
      await this.repo.update(tx, id, { status: toDb(status) as never });
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "collect", userId: me.id,
        before: { status: d.status, collected: toDecimal(collected(money)) },
        after: { status: toDb(status), collected: toDecimal(collected(after)), side: input.side, amount: input.amount, payment: payment.id, move: saved.move.no, tcr: tcrCode(n) } }, tx);
      if (status === "Fully Collected") await this.commissionsDue(tx, me, d, after, date);
      await this.tlDue(tx, me, [...after.buyers, ...after.sellers], [date.slice(0, 7)], date); // 5.8: from every collection
      return { signers, result: { status, collected: toDecimal(collected(after)), remaining: toDecimal(remaining(after)), move: saved.move.no, entry: saved.move.entry.no, tcr: tcrCode(n), code: d.code } };
    });
    const { code, ...out } = result;
    const userIds = (await this.repo.employeeNames(signers)).map((e) => e.userId);
    await this.notifications.notify({ event: "deal.tcr", userIds, link: link(id), text: `${out.tcr}: TCR جديدة على ${code} · امضي عليها` });
    // 9.15: fully collected → the accountant pays each salesperson's commission («صرف عمولة سيلز»)
    if (out.status === "Fully Collected") await this.notifications.notify({ event: "finance.commission_due", link: "/finance", text: `${code} اتحصّلت بالكامل · عمولات السيلز عليها بقت مستحقة` });
    return me.fields.hidden("deals").has("remaining") ? { ...out, remaining: "" } : out;
  }

  /**
   * 5.15 «تعديل يدوي» (M-07 · demo deals.js payEdit): Finance corrects a recorded collection and its TCR. Its voucher's
   * entry is reversed and posted again with the right amount, the deal's status and what's left follow, and the audit
   * keeps the old and new amount with the reason. Reaching the whole commission makes the salespeople's commission due.
   */
  async editCollection(me: CurrentUser, id: string, tcrId: string, input: EditCollection): Promise<DealDetail> {
    mayChange(me.fields.fixed("deals"), "collected"); // it changes what's collected (M-09)
    const amount = fromDecimal(input.amount);
    const out = await this.db.$transaction(async (tx) => {
      await this.repo.lock(tx, id);
      const d = await this.repo.detail(this.scope(me), id, tx);
      const t = d?.tcrs.find((x) => x.id === tcrId);
      if (!d || !t) throw new NotFoundException(NO_TCR);
      const money = toMoney(d, await this.repo.payments(tx, id));
      const old = fromDecimal(t.payment.amount.toFixed(2));
      const problem = collectionEditProblem(money, old, amount, input.reason);
      if (problem) throw new BadRequestException(problem);
      if (!t.payment.moveId) throw new BadRequestException("التحصيل ده مالوش سند قبض متسجّل · عدّله من القيود");
      const code = tcrCode(t.code);
      const posted = await this.vouchers.correctDealCollection(me, t.payment.moveId, amount, `تعديل تحصيل ${d.code} · ${code}: ${input.reason}`, tx);
      await this.repo.correctPayment(tx, t.payment.id, { amount: toDecimal(amount), editedFrom: toDecimal(old), editReason: input.reason });
      const after: DealMoney = { ...money, payments: [...money.payments.filter((_, i) => i !== money.payments.findIndex((p) => p.side === t.payment.side && p.amount === old)), { side: t.payment.side as "owner" | "client", amount }] };
      const status = collectionStatus(after);
      if (status !== money.status) await this.repo.update(tx, id, { status: toDb(status) as never });
      await this.audit.record({ module: "deals", entity: "Tcr", entityId: tcrId, action: "edit-collection", userId: me.id,
        before: { amount: toDecimal(old), status: d.status, collected: toDecimal(collected(money)) },
        after: { amount: toDecimal(amount), status: toDb(status), collected: toDecimal(collected(after)), reason: input.reason, tcr: code, ...posted } }, tx);
      const date = localDate(new Date());
      if (status === "Fully Collected" && money.status !== "Fully Collected") await this.commissionsDue(tx, me, d, after, date);
      await this.tlDue(tx, me, [...after.buyers, ...after.sellers], [t.payment.receivedAt.toISOString().slice(0, 7)], date); // 5.8: the month's collections changed
      return { full: status === "Fully Collected" && money.status !== "Fully Collected", code: d.code };
    });
    if (out.full) await this.notifications.notify({ event: "finance.commission_due", link: "/finance", text: `${out.code} اتحصّلت بالكامل · عمولات السيلز عليها بقت مستحقة` });
    return this.get(me, id);
  }

  /** 5.12: a salesperson on the TCR signs it, once; the time is kept and audited. */
  async sign(me: CurrentUser, id: string, tcrId: string): Promise<DealDetail> {
    await this.db.$transaction(async (tx) => {
      const t = await this.repo.tcr(this.scope(me), id, tcrId, tx);
      if (!t) throw new NotFoundException(NO_TCR);
      const problem = signProblem(t.signatures, me.employeeId);
      if (problem) throw new BadRequestException(problem);
      const signedAt = new Date();
      if (!(await this.repo.sign(tx, tcrId, me.employeeId!, signedAt)).count) throw new BadRequestException("مضيت عليها قبل كده");
      await this.audit.record({ module: "deals", entity: "Tcr", entityId: tcrId, action: "sign", userId: me.id,
        before: { signedAt: null }, after: { tcr: tcrCode(t.code), employeeId: me.employeeId, signedAt: signedAt.toISOString() } }, tx);
    });
    return this.get(me, id);
  }

  /**
   * 5.13: the TCR as a PDF page like the demo's (the client's own sample «Tcr 182» hasn't arrived yet): Places' letterhead
   * (12.12 entity), the collection, each salesperson's share, rate and commission on this amount, and who signed.
   * DocumentsService.pdf() adds the Super Admin's signature and stamp.
   */
  async tcrDocument(me: CurrentUser, id: string, tcrId: string): Promise<{ name: string; html: string }> {
    const d = await this.repo.detail(this.scope(me), id);
    const t = d && d.tcrs.find((x) => x.id === tcrId);
    if (!d || !t) throw new NotFoundException(NO_TCR);
    const side = (eid: string) => d.participants.find((p) => p.employee.id === eid)?.side;
    const signed = new Map(t.signatures.map((s) => [s.employeeId, s.signedAt]));
    const ids = t.signatures.map((s) => s.employeeId);
    // the split on this collection alone, between the people the TCR was made for
    const money = { ...toMoney(d, [t.payment]), targetBase: null, buyers: ids.filter((x) => side(x) === "BUYER"), sellers: ids.filter((x) => side(x) === "SELLER") };
    const people = new Map((await this.repo.schemes(ids, this.db)).map((e) => [e.id, e]));
    const rows = splitDeal(money, (sid) => Number(people.get(sid)?.commissionPct ?? 0));
    const head = await this.letterhead.letterhead("places");
    const code = tcrCode(t.code), date = t.payment.receivedAt.toISOString().slice(0, 10);
    // M-09: a hidden location, amount or split isn't printed (the amount tells each share too)
    const hidden = me.fields.hidden("deals"), amount = !hidden.has("payments"), split = amount && !hidden.has("shares");
    const kv: [string, string][] = [["الصفقة", `${d.code} · ${d.company}`], ["الوحدة", hidden.has("location") ? d.unit.code : `${d.unit.code} · ${d.location}`], ["تاريخ التحصيل", date],
      ["التحصيل", t.payment.side === "owner" ? "تحصيل من الـ Owner" : "تحصيل من الـ Client"]];
    const html = layout(`TCR ${code}`, `
      <div style="display:flex;align-items:center;gap:12pt;margin-bottom:12pt">${head.logo ? `<img src="${esc(head.logo)}" alt="${esc(head.name)}" style="max-height:60pt;max-width:140pt">` : `<b>${esc(head.name)}</b>`}
        <h1 style="margin:0">ورقة TCR <span class="num">${esc(code)}</span></h1></div>
      <table><tbody>${kv.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}
        ${amount ? `<tr><th>المبلغ</th><td><b>${egp(fromDecimal(t.payment.amount.toFixed(2)))}</b></td></tr>` : ""}</tbody></table>
      <table><thead><tr><th>السيلز</th><th>الجهة</th>${split ? "<th>نصيبه</th><th>نسبته</th><th>العمولة</th>" : ""}<th>الإمضاء</th></tr></thead><tbody>
        ${rows.map((r) => { const at = signed.get(r.salesId); return `<tr><td>${esc(people.get(r.salesId)?.name)}</td><td>${r.side === "buyer" ? "Buyer" : "Seller"}</td>${split ? `<td>${egp(r.share)}</td><td><span class="num">${r.schemePercent}%</span></td><td><b>${egp(r.commission)}</b></td>` : ""}<td>${at ? `مضى · <span class="num">${esc(localDate(at))}</span>` : "................."}</td></tr>`; }).join("")}
      </tbody></table>
      <p style="color:#6b7489;font-size:10pt">الـ TCR بتتعمل أوتوماتيك بعد كل تحصيل بكود تسلسلي، ولو اتحصّل باقي المبلغ بعدين بتتعمل TCR تانية لنفس الديل.</p>`);
    return { name: `TCR ${code}.pdf`, html };
  }

  /**
   * «الغي الصفقة» (M-02 2.3 (12) · 9.6): the deal drops out of targets and Transactions (commission.ts OFF_BOOKS) and
   * every entry it posted — Places' revenue and the salespeople's due commission — is reversed. The collected cash
   * stays on the client's account (113…) until finance pays it back or settles it.
   */
  async cancel(me: CurrentUser, id: string, input: CancelDeal) {
    return this.db.$transaction(async (tx) => {
      await this.repo.lock(tx, id); // read the status after the lock: a second cancel waits, then is refused
      const d = await this.repo.detail(this.scope(me), id, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      const problem = cancelProblem(label(d.status), input.reason);
      if (problem) throw new BadRequestException(problem);
      await this.repo.update(tx, id, { status: "CANCELLED" });
      await this.unitLocks.release(d.unit.id, id, { userId: me.id }, tx); // 2.9: the unit's side is open again; no lock → no-op
      const reversed = await this.ledger.reverse(me, "deal", id, `إلغاء ${d.code} · ${d.company}`, tx);
      // 5.8: the TL's month is worked out again without this deal (it's off the books now); the difference books back
      const payments = await this.repo.payments(tx, id);
      await this.tlDue(tx, me, d.participants.map((p) => p.employee.id), [...new Set(payments.map((p) => p.receivedAt.toISOString().slice(0, 7)))], localDate(new Date()));
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "cancel", userId: me.id, before: { status: d.status }, after: { status: "CANCELLED", reason: input.reason, reversed } }, tx);
      return { status: "Cancelled" as const, reversed };
    });
  }

  /** 9.12: the client file's own account (the deal itself if its lead has none). */
  private async clientAccount(tx: Prisma.TransactionClient, me: CurrentUser, d: DealRecord) {
    return this.ledger.partyAccount(me, CLIENTS_PARENT, { type: "client", id: (await this.repo.clientOf(tx, d.id)) ?? d.id, name: d.company }, tx);
  }

  /**
   * M-02 2.1 step 9 · 3.1 (5.4): Manar approves the Seller (the unit's agent) before they count. On a deal already fully
   * collected their commission wasn't posted with the last collection, so it becomes due now; their TL's figure for
   * the months of its collections is worked out again (their share now counts in the team).
   */
  async approveSeller(me: CurrentUser, id: string): Promise<DealDetail> {
    const { code, sellers } = await this.db.$transaction(async (tx) => {
      await this.repo.lock(tx, id); // then read: a collection finishing right now decides whether the seller's commission posts
      const d = await this.repo.detail(this.scope(me), id, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      const waiting = d.participants.filter((p) => p.side === "SELLER" && !p.approved).map((p) => p.employee);
      if (!waiting.length) throw new BadRequestException("مفيش Seller مستني موافقة على الصفقة دي");
      await this.repo.approveSellers(tx, id);
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "approve-seller", userId: me.id,
        before: { sellersWaiting: waiting.map((s) => s.id) }, after: { sellersApproved: waiting.map((s) => s.id), summary: `${d.code}: منار وافقت على الـ Seller ${waiting.map((s) => s.name).join("، ")}` } }, tx);
      const payments = await this.repo.payments(tx, id);
      const today = localDate(new Date()), ids = waiting.map((s) => s.id);
      if (d.status === "FULLY_COLLECTED") {
        const approved = { ...d, participants: d.participants.map((p) => ({ ...p, approved: true })) };
        await this.commissionsDue(tx, me, d, toMoney(approved, payments), today, ids);
      }
      await this.tlDue(tx, me, ids, [...new Set(payments.map((p) => p.receivedAt.toISOString().slice(0, 7)))], today);
      return { code: d.code, sellers: waiting };
    });
    const userIds = (await this.repo.employeeNames(sellers.map((s) => s.id))).map((e) => e.userId);
    await this.notifications.notify({ event: "deal.seller", userIds, link: link(id), text: `اتسجّلت Seller في الصفقة ${code} بعد موافقة منار` });
    return this.get(me, id);
  }

  /**
   * 5.8 (4 Nov): each TL's commission for a month (TargetsService, the TL report's figure) is a balance on their own
   * account under 21103; whatever changed since it was last posted is booked against «عمولة تيم ليدر» (5305).
   */
  private async tlDue(tx: Prisma.TransactionClient, me: CurrentUser, salesIds: string[], months: string[], date: string) {
    const tls = await this.repo.teamLeaders(salesIds, tx);
    if (!tls.length || !months.length) return;
    const { accounts } = await this.ledger.balances(tx);
    const expense = accounts.find((a) => a.code === TL_COMMISSION_EXPENSE);
    if (!expense) throw new BadRequestException("حساب «عمولة تيم ليدر» مش موجود في الشجرة");
    for (const month of months) {
      for (const tlId of tls) await this.repo.lockKey(tx, `tl-commission:${tlId}:${month}`);
      for (const tl of await this.targets.tlCommissions(tls, month, tx)) {
        const acc = await this.ledger.partyAccount(me, SALES_COMMISSION_PARENT, { type: "sales", id: tl.tlId, name: tl.name }, tx);
        const key = `${tl.tlId}:${month}`;
        const lines = tlAdjustment(tl.commission, await this.ledger.creditedBy(acc.id, "tl-commission", key, tx), expense.id, acc.id);
        if (lines) await this.ledger.post(me, { date, nature: "عمولة تيم ليدر مستحقة", source: "tl-commission", sourceId: key, memo: `عمولة ${tl.name} (Team Leader) · ${month} · شريحة تحقيق الفريق`, lines }, tx);
      }
    }
  }

  /**
   * 9.6: with the revenue (first collection only, under the deal's lock, so once per deal) the operations and external
   * commissions are booked on the deal itself (source «deal»), so cancelling it reverses them with the rest.
   * TL commission (5305) isn't here: 5.8 posts it per TL per month (tlDue).
   */
  private async directCostsDue(tx: Prisma.TransactionClient, me: CurrentUser, d: DealRecord, revenue: Piasters, date: string) {
    const s = await this.settings.all();
    const costs = directCosts(revenue, { opsPct: s.opsCommissionPct, externalPct: s.externalCommissionPct }, d.externalCommission ? fromDecimal(d.externalCommission.toFixed(2)) : null);
    if (!costs.ops && !costs.external) return;
    const { accounts } = await this.ledger.balances(tx);
    const code = (c: string) => accounts.find((a) => a.code === c)?.id ?? "";
    const extDue = costs.external ? (await this.ledger.namedAccount(me, ACCRUED_PARENT, EXTERNAL_COMMISSION_DUE_NAME, tx)).id : "";
    const lines = directCostLines(costs, { opsExpense: code(OPS_COMMISSION_EXPENSE), opsDue: code(OPS_COMMISSION_DUE), extExpense: code(EXTERNAL_COMMISSION_EXPENSE), extDue });
    if (lines) await this.ledger.post(me, { date, nature: "تكاليف الصفقة المباشرة", source: "deal", sourceId: d.id, memo: `عمولة اوبريشن وعمولة خارجية على ${d.code} · ${d.company}`, lines }, tx);
  }

  /** Fully collected (4 Nov): each salesperson's commission (scheme % × share, splitDeal) is due on their own 21103 account. */
  private async commissionsDue(tx: Prisma.TransactionClient, me: CurrentUser, d: DealRecord, money: DealMoney, date: string, only?: string[]) {
    const people = new Map((await this.repo.schemes([...money.buyers, ...money.sellers], tx)).map((e) => [e.id, e]));
    const shares = splitDeal(money, (sid) => Number(people.get(sid)?.commissionPct ?? 0)).filter((s) => s.commission > 0 && (!only || only.includes(s.salesId)));
    if (!shares.length) return;
    const { accounts } = await this.ledger.balances(tx);
    const expense = accounts.find((a) => a.code === SALES_COMMISSION_EXPENSE);
    if (!expense) throw new BadRequestException("حساب «عمولة مبيعات» مش موجود في الشجرة");
    const lines: EntryLine[] = [{ accountId: expense.id, debit: shares.reduce((s, x) => s + x.commission, 0), credit: 0 }];
    for (const s of shares) {
      const acc = await this.ledger.partyAccount(me, SALES_COMMISSION_PARENT, { type: "sales", id: s.salesId, name: people.get(s.salesId)!.name }, tx);
      lines.push({ accountId: acc.id, debit: 0, credit: s.commission });
    }
    await this.ledger.post(me, { date, nature: "عمولة مبيعات مستحقة", source: "deal", sourceId: d.id, memo: `عمولة السيلز على ${d.code} · اتحصّلت بالكامل`, lines }, tx);
  }

  /** What the Office Manager changed before approving, old next to new; amounts as decimal strings, never floats. */
  private async corrections(d: DealRecord, input: ReviewDeal) {
    if (input.buyers && (await this.repo.salespeople(input.buyers)).length !== new Set(input.buyers).size) throw new BadRequestException(NOT_SALES);
    const owner = input.commissionOwner && toDecimal(fromDecimal(input.commissionOwner));
    const client = input.commissionClient && toDecimal(fromDecimal(input.commissionClient));
    const external = input.externalCommission && toDecimal(fromDecimal(input.externalCommission));
    const now = { space: d.space, type: d.type, location: d.location, commissionOwner: d.commissionOwner.toFixed(2), commissionClient: d.commissionClient.toFixed(2), buyers: buyersOf(d).map((p) => p.id).sort(), externalCommission: d.externalCommission?.toFixed(2) ?? null };
    const next = { space: input.space, type: input.type, location: input.location, commissionOwner: owner, commissionClient: client, buyers: input.buyers && [...new Set(input.buyers)].sort(), externalCommission: external };
    if (!expectsCommission(fromDecimal(next.commissionOwner ?? now.commissionOwner), fromDecimal(next.commissionClient ?? now.commissionClient))) {
      throw new BadRequestException("اكتب العمولة المتوقعة من الـ Owner أو الـ Client");
    }
    return changes(now, next);
  }

  private async announce(d: DealRecord, input: ReviewDeal) {
    const buyers = await this.repo.employeeNames(input.buyers ?? buyersOf(d).map((p) => p.id));
    const userIds = buyers.map((b) => b.userId);
    if (input.decision === "reject") {
      await this.notifications.notify({ event: "deal.rejected", userIds, link: link(d.id), text: `الصفقة ${d.code} اترفضت: ${input.reason}` });
      return;
    }
    const commission = fromDecimal(input.commissionOwner ?? d.commissionOwner.toFixed(2)) + fromDecimal(input.commissionClient ?? d.commissionClient.toFixed(2));
    await this.notifications.notify({ event: "deal.approved", userIds, link: link(d.id), text: `صفقة اتقفلت ${d.code} · ${d.company} · العمولة ${formatEGP(commission)} · مستنية التحصيل` });
    // M-02 2.1 step 7 · Q26 (4.9): marketing hears of it with the allowed fields only — location, space, company, type, the Buyer
    const space = input.space ?? d.space, type = input.type ?? d.type, location = input.location ?? d.location;
    await this.notifications.notify({ event: "deal.marketing", link: "/marketing?tab=deals",
      text: `Done Deal اتسجّلت في الشيت: ${type} · ${location} · ${space} م · ${d.company} · ${d.lead?.name ?? d.company}` });
  }

  private async names(ids: string[]) {
    return new Map((ids.length ? await this.repo.employeeNames([...new Set(ids)]) : []).map((e) => [e.id, e.name]));
  }
}

/** The deal as commission.ts reads it; the Seller counts once Manar approved them (5.4). */
export function toMoney(d: Omit<DealRowRecord, "payments">, payments: Array<{ side: string; amount: { toFixed(n: number): string } }>): DealMoney {
  const sellers = d.participants.filter((p) => p.side === "SELLER" && p.approved).map((p) => p.employee.id);
  return {
    status: label(d.status), commissionOwner: fromDecimal(d.commissionOwner.toFixed(2)), commissionClient: fromDecimal(d.commissionClient.toFixed(2)),
    payments: payments.map((p) => ({ side: p.side as "owner" | "client", amount: fromDecimal(p.amount.toFixed(2)) })),
    buyers: buyersOf(d).map((p) => p.id), sellers, sellerApproved: true, targetBase: d.targetBase ? fromDecimal(d.targetBase.toFixed(2)) : null, offTarget: d.offTarget,
  };
}

const buyersOf = (d: Pick<DealRowRecord, "participants">) => d.participants.filter((p) => p.side === "BUYER").map((p) => p.employee);

export function toRow(d: DealRowRecord): DealRow {
  return {
    id: d.id, code: d.code, company: d.company, unitCode: d.unit.code, location: d.location, space: d.space, type: d.type as DealType,
    status: label(d.status), commissionOwner: d.commissionOwner.toFixed(2), commissionClient: d.commissionClient.toFixed(2),
    buyers: buyersOf(d), sellers: d.participants.filter((p) => p.side === "SELLER").map((p) => ({ ...p.employee, approved: p.approved })),
    closedAt: d.closedAt.toISOString(), offTarget: d.offTarget, note: d.note, targetBase: d.targetBase?.toFixed(2) ?? null,
    month: d.payments[0]?.receivedAt.toISOString().slice(0, 7) ?? null, tcrs: d.tcrs.map((t) => tcrCode(t.code)),
    execDueAt: day(d.execDueAt), executedAt: day(d.executedAt), papersOk: d.papersOk, papersNote: d.papersNote,
  };
}

function toDetail(d: DealRecord, reviewedBy: string | null): DealDetail {
  return {
    ...toRow(d), leadId: d.leadId, leadCode: d.lead?.code ?? null, source: d.source, unitId: d.unit.id,
    reviewNote: d.reviewNote, reviewedBy, reviewedAt: d.reviewedAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString(),
    tcrs: d.tcrs.map((t) => ({
      id: t.id, code: tcrCode(t.code), date: t.payment.receivedAt.toISOString().slice(0, 10), side: t.payment.side as "owner" | "client", amount: t.payment.amount.toFixed(2),
      edited: t.payment.editedFrom ? { from: t.payment.editedFrom.toFixed(2), reason: t.payment.editReason ?? "" } : null,
      signatures: t.signatures.map((s) => {
        const p = d.participants.find((x) => x.employee.id === s.employeeId);
        return { id: s.employeeId, name: p?.employee.name ?? "", side: p?.side === "SELLER" ? "seller" as const : "buyer" as const, signedAt: s.signedAt?.toISOString() ?? null };
      }),
    })),
  };
}
