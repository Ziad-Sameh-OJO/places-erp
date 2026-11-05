import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CollectDeal, CreateDeal, DealCollected, DealDetail, DealFilters, DealForm, DealNote, DealRow, DealUnit, Paged, ReviewDeal } from "@places/contracts";
import { CLIENTS_PARENT, SALES_COMMISSION_EXPENSE, SALES_COMMISSION_PARENT, TL_COMMISSION_EXPENSE, tlAdjustment, type DealMoney, type DealStatus, type DealType, type EntryLine, changes, collected, collectionProblem, collectionStatus, localDate, remaining, revenueOnCollection, splitDeal, closedTooSoon, dealCode, dealSides, expectsCommission, formatEGP, fromDecimal, reviewProblem, ruleRecipients, takesNote, toDecimal } from "@places/domain";
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
import { TargetsService } from "../kpis/targets.service";
import { type DealRecord, type DealRowRecord, DealsRepository } from "./deals.repository";

/** Out of scope or gone: the same answer, so it doesn't tell whether the deal exists. */
const NO_DEAL = "الصفقة دي مش موجودة";
const NOT_SALES = "اختار سيلز من القايمة";
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
    private readonly targets: TargetsService,
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
    return this.db.$transaction(async (tx) => {
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
      const after: DealMoney = { ...money, payments: [...money.payments, { side: input.side, amount }] };
      const status = collectionStatus(after);
      await this.repo.update(tx, id, { status: toDb(status) as never });
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "collect", userId: me.id,
        before: { status: d.status, collected: toDecimal(collected(money)) },
        after: { status: toDb(status), collected: toDecimal(collected(after)), side: input.side, amount: input.amount, payment: payment.id, move: saved.move.no } }, tx);
      if (status === "Fully Collected") await this.commissionsDue(tx, me, d, after, date);
      await this.tlDue(tx, me, [...after.buyers, ...after.sellers], [date.slice(0, 7)], date); // 5.8: from every collection
      return { status, collected: toDecimal(collected(after)), remaining: toDecimal(remaining(after)), move: saved.move.no, entry: saved.move.entry.no };
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
      const d = await this.repo.detail(this.scope(me), id, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      await this.repo.lock(tx, id);
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

/** The deal as commission.ts reads it; the Seller counts once Manar approved them (5.4). */
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
  };
}

function toDetail(d: DealRecord, reviewedBy: string | null): DealDetail {
  return {
    ...toRow(d), leadId: d.leadId, leadCode: d.lead?.code ?? null, source: d.source, unitId: d.unit.id,
    reviewNote: d.reviewNote, reviewedBy, reviewedAt: d.reviewedAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString(),
  };
}
