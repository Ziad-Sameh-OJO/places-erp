import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CancelDeal, CollectDeal, CreateDeal, DealCollected, DealDetail, DealFilters, DealForm, DealNote, DealRow, DealUnit, Paged, ReviewDeal } from "@places/contracts";
import { CLIENTS_PARENT, SALES_COMMISSION_EXPENSE, SALES_COMMISSION_PARENT, type DealMoney, type DealStatus, type DealType, type EntryLine, cancelProblem, changes, collected, collectionProblem, collectionStatus, localDate, remaining, revenueOnCollection, splitDeal, closedTooSoon, dealCode, dealSides, expectsCommission, formatEGP, fromDecimal, reviewProblem, ruleRecipients, signProblem, takesNote, tcrCode, toDecimal, type Piasters } from "@places/domain";
import { esc, layout } from "../../core/documents/documents.service";
import { DocumentsSetupService } from "../settings/documents-setup.service";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { LeadsService } from "../leads/leads.service";
import { InventoryService } from "../inventory/inventory.service";
import { LeadRulesService } from "../leads/lead-rules.service";
import { LedgerService } from "../finance/ledger.service";
import { VouchersService } from "../finance/vouchers.service";
import { type DealRecord, type DealRowRecord, DealsRepository } from "./deals.repository";

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
  ) {}

  /** M-02 4.1: a salesperson sees the deals they are on, a TL their team's, the managers all of them. */
  private scope(me: CurrentUser): Prisma.DealWhereInput {
    const own = ownedBy(me, "employeeId");
    return Object.keys(own).length ? { participants: { some: own } } : {};
  }

  async list(me: CurrentUser, f: DealFilters): Promise<Paged<DealRow>> {
    const [rows, total] = await this.repo.list(this.scope(me), f, f.status && toDb(f.status));
    return { items: rows.map(toRow), total, page: f.page, pageSize: f.pageSize };
  }

  async get(me: CurrentUser, id: string): Promise<DealDetail> {
    const d = await this.repo.detail(this.scope(me), id);
    if (!d) throw new NotFoundException(NO_DEAL);
    return toDetail(d, d.reviewedById ? await this.repo.userName(d.reviewedById) : null);
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
    return { leads: leads.map((l) => ({ id: l.id, code: l.code, name: l.name, company: l.company?.name ?? null })), salespeople };
  }

  async units(q?: string): Promise<DealUnit[]> {
    const units = await this.inventory.forDeal(q);
    const names = await this.names(units.map((u) => u.agentId).filter((x): x is string => !!x));
    return units.map((u) => ({ id: u.id, code: u.code, project: u.project, space: u.space, type: u.type, agent: u.agentId ? { id: u.agentId, name: names.get(u.agentId) ?? "" } : null }));
  }

  /**
   * 2.1 steps 1 · 5 · 9: the salesperson registers the deal the day it closes. Company and source come from the lead,
   * the location and the Seller (the unit's agent, waiting for Manar) from the unit. It waits for the Office Manager (Q9).
   */
  async create(me: CurrentUser, input: CreateDeal): Promise<DealDetail> {
    const owner = fromDecimal(input.commissionOwner), client = fromDecimal(input.commissionClient);
    if (!expectsCommission(owner, client)) throw new BadRequestException("اكتب العمولة المتوقعة من الـ Owner أو الـ Client");
    const [lead] = await this.leads.dealLeads(me, input.leadId);
    if (!lead) throw new NotFoundException("الليد ده مش موجود أو مبقاش معاك");
    const unit = await this.inventory.openForDeal(input.unitId);
    if (!unit) throw new BadRequestException("الوحدة دي مش متاحة · اختار من القايمة");
    const closer = lead.assignedToId ?? me.employeeId;
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
      await this.leads.markDoneDeal(tx, me, lead, `اتسجّلت صفقة ${code} على ${unit.code}`);
      return { id: deal.id, code };
    });
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
  async review(me: CurrentUser, id: string, input: ReviewDeal): Promise<DealDetail> {
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
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "approve", userId: me.id,
        before: { status: d.status, ...edits?.before }, after: { status: "APPROVED", ...edits?.after } }, tx);
      return d;
    });
    await this.announce(result, input);
    return this.get(me, id);
  }

  /**
   * «note» (M-02 3.1 · 2.3): the Office Manager or Finance write a special case on a deal on the sheet; a different
   * amount (targetBase) changes what enters the targets only, never the commission (commission.ts splitDeal).
   */
  async setNote(me: CurrentUser, id: string, input: DealNote): Promise<DealDetail> {
    await this.db.$transaction(async (tx) => {
      const d = await this.repo.detail(this.scope(me), id, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      if (!takesNote(label(d.status))) throw new BadRequestException("الـ note بتتكتب على صفقة اتوافق عليها بس");
      const next = { note: input.note || null, targetBase: input.targetBase && toDecimal(fromDecimal(input.targetBase)) };
      const diff = changes({ note: d.note, targetBase: d.targetBase?.toFixed(2) ?? null }, next);
      if (!diff) return;
      await this.repo.update(tx, id, next);
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "note", userId: me.id, ...diff }, tx);
    });
    return this.get(me, id);
  }

  /**
   * «سجّل تحصيل» (5.3, the accountant's meeting 4 Nov): a receive voucher (9.11) into the chosen safe / bank against
   * the client's account (113…). The first collection books Places' whole commission as revenue (Q37–Q39), so the
   * client's account = commission − collected. Fully collected: each salesperson's commission becomes due under 21103.
   */
  async collect(me: CurrentUser, id: string, input: CollectDeal): Promise<DealCollected> {
    const amount = fromDecimal(input.amount);
    const lines = await this.vouchers.commissionLines();
    const { result, signers } = await this.db.$transaction(async (tx) => {
      const d = await this.repo.detail(this.scope(me), id, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      await this.repo.lock(tx, id);
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
      }
      const from = input.side === "owner" ? "من الـ Owner" : "من الـ Client";
      const saved = await this.vouchers.recordDealCollection(me, { toId: input.toId, clientAccountId: client.id, amount: input.amount, party: d.company, ref: d.code, memo: `تحصيل عمولة ${d.code} ${from}`, date }, tx);
      const payment = await this.repo.addPayment(tx, { dealId: id, side: input.side, amount: toDecimal(amount), receivedAt: new Date(`${date}T00:00:00Z`), accountId: input.toId, recordedById: me.id });
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
      return { signers, result: { status, collected: toDecimal(collected(after)), remaining: toDecimal(remaining(after)), move: saved.move.no, entry: saved.move.entry.no, tcr: tcrCode(n), code: d.code } };
    });
    const { code, ...out } = result;
    const userIds = (await this.repo.employeeNames(signers)).map((e) => e.userId);
    await this.notifications.notify({ event: "deal.tcr", userIds, link: link(id), text: `${out.tcr}: TCR جديدة على ${code} · امضي عليها` });
    return out;
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
    const kv: [string, string][] = [["الصفقة", `${d.code} · ${d.company}`], ["الوحدة", `${d.unit.code} · ${d.location}`], ["تاريخ التحصيل", date],
      ["التحصيل", t.payment.side === "owner" ? "تحصيل من الـ Owner" : "تحصيل من الـ Client"]];
    const html = layout(`TCR ${code}`, `
      <div style="display:flex;align-items:center;gap:12pt;margin-bottom:12pt">${head.logo ? `<img src="${esc(head.logo)}" alt="${esc(head.name)}" style="max-height:60pt;max-width:140pt">` : `<b>${esc(head.name)}</b>`}
        <h1 style="margin:0">ورقة TCR <span class="num">${esc(code)}</span></h1></div>
      <table><tbody>${kv.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}
        <tr><th>المبلغ</th><td><b>${egp(fromDecimal(t.payment.amount.toFixed(2)))}</b></td></tr></tbody></table>
      <table><thead><tr><th>السيلز</th><th>الجهة</th><th>نصيبه</th><th>نسبته</th><th>العمولة</th><th>الإمضاء</th></tr></thead><tbody>
        ${rows.map((r) => { const at = signed.get(r.salesId); return `<tr><td>${esc(people.get(r.salesId)?.name)}</td><td>${r.side === "buyer" ? "Buyer" : "Seller"}</td><td>${egp(r.share)}</td><td><span class="num">${r.schemePercent}%</span></td><td><b>${egp(r.commission)}</b></td><td>${at ? `مضى · <span class="num">${esc(localDate(at))}</span>` : "................."}</td></tr>`; }).join("")}
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
      const reversed = await this.ledger.reverse(me, "deal", id, `إلغاء ${d.code} · ${d.company}`, tx);
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "cancel", userId: me.id, before: { status: d.status }, after: { status: "CANCELLED", reason: input.reason, reversed } }, tx);
      return { status: "Cancelled" as const, reversed };
    });
  }

  /** 9.12: the client file's own account (the deal itself if its lead has none). */
  private async clientAccount(tx: Prisma.TransactionClient, me: CurrentUser, d: DealRecord) {
    return this.ledger.partyAccount(me, CLIENTS_PARENT, { type: "client", id: (await this.repo.clientOf(tx, d.id)) ?? d.id, name: d.company }, tx);
  }

  /** Fully collected (4 Nov): each salesperson's commission (scheme % × share, splitDeal) is due on their own 21103 account. */
  private async commissionsDue(tx: Prisma.TransactionClient, me: CurrentUser, d: DealRecord, money: DealMoney, date: string) {
    const people = new Map((await this.repo.schemes([...money.buyers, ...money.sellers], tx)).map((e) => [e.id, e]));
    const shares = splitDeal(money, (sid) => Number(people.get(sid)?.commissionPct ?? 0)).filter((s) => s.commission > 0);
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
    const now = { space: d.space, type: d.type, location: d.location, commissionOwner: d.commissionOwner.toFixed(2), commissionClient: d.commissionClient.toFixed(2), buyers: buyersOf(d).map((p) => p.id).sort() };
    const next = { space: input.space, type: input.type, location: input.location, commissionOwner: owner, commissionClient: client, buyers: input.buyers && [...new Set(input.buyers)].sort() };
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

/** The deal as commission.ts reads it; the Seller counts once Manar approved them (5.5). */
function toMoney(d: DealRecord, payments: Array<{ side: string; amount: { toFixed(n: number): string } }>): DealMoney {
  const sellers = d.participants.filter((p) => p.side === "SELLER" && p.approved).map((p) => p.employee.id);
  return {
    status: label(d.status), commissionOwner: fromDecimal(d.commissionOwner.toFixed(2)), commissionClient: fromDecimal(d.commissionClient.toFixed(2)),
    payments: payments.map((p) => ({ side: p.side as "owner" | "client", amount: fromDecimal(p.amount.toFixed(2)) })),
    buyers: buyersOf(d).map((p) => p.id), sellers, sellerApproved: true, targetBase: d.targetBase ? fromDecimal(d.targetBase.toFixed(2)) : null, offTarget: d.offTarget,
  };
}

const buyersOf = (d: DealRowRecord) => d.participants.filter((p) => p.side === "BUYER").map((p) => p.employee);

function toRow(d: DealRowRecord): DealRow {
  return {
    id: d.id, code: d.code, company: d.company, unitCode: d.unit.code, location: d.location, space: d.space, type: d.type as DealType,
    status: label(d.status), commissionOwner: d.commissionOwner.toFixed(2), commissionClient: d.commissionClient.toFixed(2),
    buyers: buyersOf(d), sellers: d.participants.filter((p) => p.side === "SELLER").map((p) => ({ ...p.employee, approved: p.approved })),
    closedAt: d.closedAt.toISOString(), offTarget: d.offTarget, note: d.note, targetBase: d.targetBase?.toFixed(2) ?? null,
    month: d.payments[0]?.receivedAt.toISOString().slice(0, 7) ?? null, tcrs: d.tcrs.map((t) => tcrCode(t.code)),
  };
}

function toDetail(d: DealRecord, reviewedBy: string | null): DealDetail {
  return {
    ...toRow(d), leadId: d.leadId, leadCode: d.lead?.code ?? null, source: d.source, unitId: d.unit.id,
    reviewNote: d.reviewNote, reviewedBy, reviewedAt: d.reviewedAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString(),
    tcrs: d.tcrs.map((t) => ({
      id: t.id, code: tcrCode(t.code), date: t.payment.receivedAt.toISOString().slice(0, 10), side: t.payment.side as "owner" | "client", amount: t.payment.amount.toFixed(2),
      signatures: t.signatures.map((s) => {
        const p = d.participants.find((x) => x.employee.id === s.employeeId);
        return { id: s.employeeId, name: p?.employee.name ?? "", side: p?.side === "SELLER" ? "seller" as const : "buyer" as const, signedAt: s.signedAt?.toISOString() ?? null };
      }),
    })),
  };
}
