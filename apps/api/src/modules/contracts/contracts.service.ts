import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CalendarItem, CollectionReport, ContractCalendar, ContractDetail, ContractFilters, ContractForm, ContractRow, ContractSummary, CreateContract, DecideValue, Paged, ProposeValue, RecordPayment, TerminateContract } from "@places/contracts";
import {
  type ContractStatus, type InstallmentLine, RENEWAL_WINDOW_DAYS, agingBuckets, contractProblem, daysBetween, endingSoon, fromDecimal,
  formatEGP, installmentPlan, installmentState, localDate, nextYearValue, paymentProblem, respread, terminationProblem, toDecimal,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { FilesService } from "../../core/files/files.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { DealsService } from "../deals/deals.service";
import { DocumentsSetupService } from "../settings/documents-setup.service";
import { UnitsService } from "../inventory/units.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { type ContractRecord, ContractsRepository, type PaymentRecord } from "./contracts.repository";

const NO_CONTRACT = "العقد ده مش موجود";
const FILE_ENTITY = "Contract";
const PDF = "application/pdf";
/** M-09: a field the person may only read (or not see) can't be written through its own endpoint. */
const LOCKED = "الحقل ده مقفول عليك";
/** ACTIVE ↔ «Active»: the API speaks the statuses as the screens show them. */
const label = (s: string) => (s[0] + s.slice(1).toLowerCase()) as ContractStatus;
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * M-11 · a Done Deal's contract and its installment table (2.1 steps 1–2). Recording payments, receipts and the
 * renewal / overdue alerts come with their own tasks (6.3, T-21).
 */
@Injectable()
export class ContractsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: ContractsRepository,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly deals: DealsService,
    private readonly docs: DocumentsSetupService,
    private readonly units: UnitsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** M-11 4.1: a salesperson sees the contracts of their own deals («عقود عملاءه»), Finance and management all. */
  private scope(me: CurrentUser): Prisma.ContractWhereInput {
    const own = ownedBy(me, "employeeId");
    return Object.keys(own).length ? { deal: { participants: { some: own } } } : {};
  }

  async list(me: CurrentUser, f: ContractFilters, now = new Date()): Promise<Paged<ContractRow>> {
    const today = localDate(now);
    const ending: Prisma.ContractWhereInput = f.ending ? { status: "ACTIVE", endsOn: { gte: new Date(today), lte: new Date(addDays(today, RENEWAL_WINDOW_DAYS)) } } : {};
    const [rows, total] = await this.repo.list(this.scope(me), f, { ...(f.status ? { status: f.status.toUpperCase() as never } : {}), ...ending });
    const hidden = me.fields.hidden("contracts");
    return { items: rows.map((r) => hideRow(toRow(r, today), hidden)), total, page: f.page, pageSize: f.pageSize };
  }

  async get(me: CurrentUser, id: string, now = new Date()): Promise<ContractDetail> {
    const c = await this.repo.detail(this.scope(me), id);
    if (!c) throw new NotFoundException(NO_CONTRACT);
    const today = localDate(now);
    const pendingBy = c.pendingById ? await this.repo.userName(c.pendingById) : null;
    return hideDetail({
      ...toRow(c, today), createdAt: c.createdAt.toISOString(),
      endedOn: c.endedOn ? day(c.endedOn) : null, endReason: c.endReason, penalty: c.penalty?.toFixed(2) ?? null,
      pending: c.pendingValue && c.pendingAt ? { value: c.pendingValue.toFixed(2), reason: c.pendingReason ?? "", by: pendingBy, at: c.pendingAt.toISOString(), mine: c.pendingById === me.id } : null,
      nextYearValue: toDecimal(nextYearValue(fromDecimal(c.value.toFixed(2)), Number(c.escalation))),
      file: c.fileId ? await this.repo.file(c.fileId).then((f) => f && { id: f.id, name: f.name }) : null,
      installments: c.installments.map((i, k) => {
        const amount = fromDecimal(i.amount.toFixed(2)), paid = fromDecimal(i.paid.toFixed(2));
        return {
          id: i.id, dueOn: day(i.dueOn), amount: toDecimal(amount), paid: toDecimal(paid), state: installmentState({ dueOn: day(i.dueOn), amount, paid }, today),
          payments: i.payments.map((p, n) => ({ id: p.id, amount: p.amount.toFixed(2), paidOn: day(p.paidOn), receiptNo: receiptNo(c.code, k, n) })),
        };
      }),
    }, me.fields.hidden("contracts"));
  }

  /** The demo's tiles (active · ending · late installments · collected), the renewals card and the Aging (M-11 5.1 · 6.1). */
  async summary(me: CurrentUser, now = new Date()): Promise<ContractSummary> {
    const today = localDate(now);
    const all = await this.repo.forSummary(this.scope(me));
    const lines = all.filter((c) => c.status === "ACTIVE").flatMap((c) => c.installments.map((i) => ({ dueOn: day(i.dueOn), amount: fromDecimal(i.amount.toFixed(2)), paid: fromDecimal(i.paid.toFixed(2)) })));
    const late = lines.filter((l) => l.paid < l.amount && l.dueOn < today);
    const rows = all.map((c) => toRow(c, today));
    const renewals = rows.filter((r) => r.endingSoon).sort((a, b) => a.daysLeft - b.daysLeft);
    const h = me.fields.hidden("contracts"); // M-09: the tiles and the Aging are made of the installments and the payments
    return {
      active: rows.filter((r) => r.status === "Active").length, endingSoon: renewals.length,
      late: h.has("late") ? { count: 0, amount: "" } : { count: late.length, amount: toDecimal(late.reduce((s, l) => s + l.amount - l.paid, 0)) },
      paid: h.has("paid") ? "" : toDecimal(rows.reduce((s, r) => s + fromDecimal(r.paid), 0)),
      aging: h.has("aging") ? ["", "", "", ""] : agingBuckets(lines, today).map(toDecimal) as ContractSummary["aging"],
      renewals: renewals.slice(0, 10).map((r) => hideRow(r, h)),
    };
  }

  /** M-11 5.3: the month's installments (with their state) and contract ends, by day. */
  async calendar(me: CurrentUser, month: string, now = new Date()): Promise<ContractCalendar> {
    const today = localDate(now);
    const from = new Date(`${month}-01T00:00:00Z`), to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    const [installments, ends] = await this.repo.month(this.scope(me), from, to);
    const byDay: Record<string, CalendarItem[]> = {};
    const add = (d: Date, item: CalendarItem) => (byDay[day(d)] ??= []).push(item);
    // M-09: the installments are the table's: without it the calendar has the contracts' ends only
    for (const i of me.fields.hidden("contracts").has("installments") ? [] : installments) {
      const amount = fromDecimal(i.amount.toFixed(2)), paid = fromDecimal(i.paid.toFixed(2));
      add(i.dueOn, { contractId: i.contract.id, code: i.contract.code, client: i.contract.deal.company, kind: "installment", amount: toDecimal(amount), state: installmentState({ dueOn: day(i.dueOn), amount, paid }, today) });
    }
    for (const c of ends) add(c.endsOn, { contractId: c.id, code: c.code, client: c.deal.company, kind: "end", amount: null, state: null });
    return { month, byDay };
  }

  /**
   * M-11 2.1 step 4 · 4.1: Finance records what the client paid on an installment — all of it or part (2.3 Partially
   * Paid). The payment and the installment's new total are saved and audited together.
   * Not posted to the journal: whether a tenant's installment is Places' money is still open (M-11 7.2).
   */
  async pay(me: CurrentUser, installmentId: string, input: RecordPayment, now = new Date()): Promise<ContractDetail> {
    if (me.fields.fixed("contracts").has("paid")) throw new ForbiddenException(LOCKED);
    const today = localDate(now), paidOn = input.paidOn ?? today, amount = fromDecimal(input.amount);
    const contractId = await this.db.$transaction(async (tx) => {
      const i = await this.repo.installment(tx, this.scope(me), installmentId);
      if (!i) throw new NotFoundException("القسط ده مش موجود");
      const before = fromDecimal(i.paid.toFixed(2));
      const problem = paymentProblem(amount, fromDecimal(i.amount.toFixed(2)) - before, paidOn, today);
      if (problem) throw new BadRequestException(problem);
      if (!(await this.repo.setPaid(tx, i.id, i.paid, toDecimal(before + amount))).count) throw new ConflictException("القسط اتعدّل دلوقتي، جرّب تاني");
      const p = await this.repo.addPayment(tx, { installmentId: i.id, amount: toDecimal(amount), paidOn: new Date(paidOn), createdById: me.id });
      await this.audit.record({ module: "contracts", entity: "InstallmentPayment", entityId: p.id, action: "create", userId: me.id,
        before: { installmentId: i.id, paid: toDecimal(before) }, after: { installmentId: i.id, amount: toDecimal(amount), paidOn, paid: toDecimal(before + amount) } }, tx);
      return i.contractId;
    });
    return this.get(me, contractId, now);
  }

  /** «تقرير التحصيل» (M-11 6.1): the month's due vs collected, every payment with its receipt, and the Aging now. */
  async collections(me: CurrentUser, month: string, now = new Date()): Promise<CollectionReport> {
    const from = new Date(`${month}-01T00:00:00Z`), to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    const [[payments, due], { aging }] = await Promise.all([this.repo.collections(this.scope(me), from, to), this.summary(me, now)]);
    const h = me.fields.hidden("contracts"); // M-09: what fell due is the installments', what came in the payments'
    return {
      month, due: h.has("installments") ? "" : toDecimal(fromDecimal((due._sum.amount ?? 0).toFixed(2))), aging,
      collected: h.has("collected") ? "" : toDecimal(payments.reduce((s, p) => s + fromDecimal(p.amount.toFixed(2)), 0)),
      items: (h.has("payments") ? [] : payments).map((p) => ({
        paymentId: p.id, contractId: p.installment.contract.id, code: p.installment.contract.code, client: p.installment.contract.deal.company,
        unitCode: p.installment.contract.deal.unit.code, dueOn: day(p.installment.dueOn), paidOn: day(p.paidOn), amount: p.amount.toFixed(2), receiptNo: paymentReceiptNo(p),
      })),
    };
  }

  /** 6.7: a payment's receipt from the 12.12 template (the entity's logo; the stamp and signature come when printed), for whoever sees the contract. */
  async receipt(me: CurrentUser, paymentId: string) {
    if (me.fields.hidden("contracts").has("payments")) throw new ForbiddenException(LOCKED);
    const p = await this.repo.payment(this.scope(me), paymentId);
    if (!p) throw new NotFoundException("الدفعة دي مش موجودة");
    const c = p.installment.contract, no = paymentReceiptNo(p);
    // shortcut: printed under the first entity (places); move to the contract's own once contracts carry one (open question)
    const [entity] = await this.docs.entities();
    const { title, html } = await this.docs.render("installment", {
      no, date: day(p.paidOn), entityId: entity?.id ?? "", company: c.deal.company, unit: c.deal.unit.code, unitInfo: c.deal.location,
      amount: p.amount.toFixed(2), kind: "", claimNo: "", contractNo: c.code,
      installment: `القسط ${c.installments.findIndex((x) => x.id === p.installment.id) + 1} من ${c.installments.length}`,
    });
    return { name: `${title} ${no}.pdf`, html };
  }

  async form(me: CurrentUser): Promise<ContractForm> {
    return { deals: await this.deals.contractable(me) };
  }

  /**
   * M-11 2.3 · 6.2: early termination — the reason and the penalty are recorded and the unit is open again in the
   * inventory (UnitsService.release, 2.9), in the same transaction.
   */
  async terminate(me: CurrentUser, id: string, input: TerminateContract): Promise<ContractDetail> {
    // M-09: a penalty the person may not set stays empty (0)
    const penalty = me.fields.fixed("contracts").has("penalty") ? 0 : fromDecimal(input.penalty);
    await this.db.$transaction(async (tx) => {
      const c = await this.load(me, id, tx); // read inside: a second «فسخ» at the same time sees the first
      const problem = terminationProblem(label(c.status), input.reason, penalty);
      if (problem) throw new BadRequestException(problem);
      const data = { status: "TERMINATED" as const, endedOn: new Date(localDate(new Date())), endReason: input.reason, penalty: toDecimal(penalty) };
      await this.repo.update(tx, id, data);
      await this.units.release(c.deal.unit.id, c.deal.id, { userId: me.id }, tx);
      await this.audit.record({ module: "contracts", entity: "Contract", entityId: id, action: "terminate", userId: me.id,
        before: { status: c.status }, after: { status: data.status, reason: input.reason, penalty: data.penalty } }, tx);
    });
    return this.get(me, id);
  }

  /** M-11 2.2: a change of value after signing waits for management; the contract keeps its value meanwhile. */
  async proposeValue(me: CurrentUser, id: string, input: ProposeValue): Promise<ContractDetail> {
    if (me.fields.fixed("contracts").has("value")) throw new ForbiddenException(LOCKED);
    const c = await this.load(me, id);
    if (c.status !== "ACTIVE") throw new BadRequestException("العقد ده مش شغال");
    const value = toDecimal(fromDecimal(input.value));
    if (value === c.value.toFixed(2)) throw new BadRequestException("دي نفس قيمة العقد");
    await this.db.$transaction(async (tx) => {
      await this.repo.update(tx, id, { pendingValue: value, pendingReason: input.reason, pendingById: me.id, pendingAt: new Date() });
      await this.audit.record({ module: "contracts", entity: "Contract", entityId: id, action: "value-request", userId: me.id, after: { value, reason: input.reason } }, tx);
    });
    await this.notifications.notify({ event: "contract.value", link: `/contracts?open=${id}`,
      text: `طلب تغيير قيمة العقد ${c.code} (${c.deal.company}) من ${formatEGP(fromDecimal(c.value.toFixed(2)))} لـ ${formatEGP(fromDecimal(value))} · ${input.reason}` });
    return this.get(me, id);
  }

  /**
   * Management decides (M-11 2.2), never the one who asked. Approved: the value changes and what is still to pay is
   * spread again over the installments not paid yet (domain respread); old and new values are audited.
   */
  async decideValue(me: CurrentUser, id: string, input: DecideValue): Promise<ContractDetail> {
    if (me.fields.fixed("contracts").has("value")) throw new ForbiddenException(LOCKED);
    const clear = { pendingValue: null, pendingReason: null, pendingById: null, pendingAt: null };
    await this.db.$transaction(async (tx) => {
      const c = await this.load(me, id, tx); // read inside: a payment recorded right now must count in the respread
      if (!c.pendingValue) throw new BadRequestException("مفيش طلب تغيير قيمة على العقد ده");
      if (c.pendingById === me.id) throw new ForbiddenException("الموافقة لحد غير اللي طلب التغيير");
      const lines = c.installments.map((i) => ({ amount: fromDecimal(i.amount.toFixed(2)), paid: fromDecimal(i.paid.toFixed(2)) }));
      const spread = input.decision === "approve" ? respread(lines, fromDecimal(c.pendingValue.toFixed(2))) : null;
      if (spread && "problem" in spread) throw new BadRequestException(spread.problem);
      if (spread && "amounts" in spread) {
        await this.repo.update(tx, id, { value: c.pendingValue!.toFixed(2), ...clear });
        for (const [k, i] of c.installments.entries()) {
          const amount = toDecimal(spread.amounts[k]!);
          if (amount !== i.amount.toFixed(2)) await this.repo.setInstallmentAmount(tx, i.id, amount);
        }
      } else await this.repo.update(tx, id, clear);
      await this.audit.record({ module: "contracts", entity: "Contract", entityId: id, action: input.decision === "approve" ? "value" : "value-refused", userId: me.id,
        before: { value: c.value.toFixed(2), installments: c.installments.map((i) => i.amount.toFixed(2)) },
        after: spread && "amounts" in spread ? { value: c.pendingValue!.toFixed(2), installments: spread.amounts.map(toDecimal) } : { refused: c.pendingValue!.toFixed(2) } }, tx);
    });
    return this.get(me, id);
  }

  private async load(me: CurrentUser, id: string, tx?: Prisma.TransactionClient) {
    const c = await this.repo.detail(this.scope(me), id, tx);
    if (!c) throw new NotFoundException(NO_CONTRACT);
    return c;
  }

  /** The signed PDF: whoever may see the contract. */
  async fileUrl(me: CurrentUser, id: string) {
    const c = await this.repo.detail(this.scope(me), id);
    if (!c?.fileId || me.fields.hidden("contracts").has("file")) throw new NotFoundException(NO_CONTRACT);
    return this.files.downloadUrl(c.fileId);
  }

  /**
   * M-11 2.1 steps 1–2: the contract is uploaded on an approved deal of the caller's (one per deal), with its PDF; the
   * system builds the installment table (value ÷ count, M-11 3.2) unless it's written line by line.
   */
  async create(me: CurrentUser, sent: CreateContract): Promise<ContractDetail> {
    // M-09: the value, the table and the PDF make the contract, so a person who may not set one can't upload it; a
    // yearly increase they may not set starts at 0
    const fixed = me.fields.fixed("contracts");
    if (["value", "installments", "file"].some((k) => fixed.has(k))) throw new ForbiddenException(LOCKED);
    const input = fixed.has("escalation") ? { ...sent, escalation: 0 } : sent;
    const deal = await this.deals.forContract(me, input.dealId);
    if (!deal) throw new NotFoundException("الصفقة دي مش موجودة أو لسه ماتوافقش عليها");
    if (await this.repo.existsForDeal(deal.id)) throw new ConflictException("الصفقة دي ليها عقد بالفعل");
    const value = fromDecimal(input.value);
    const plan: InstallmentLine[] = "lines" in input.schedule
      ? input.schedule.lines.map((l) => ({ dueOn: l.dueOn, amount: fromDecimal(l.amount) }))
      : installmentPlan(value, input.startsOn, input.schedule.count, input.schedule.everyMonths);
    const problem = contractProblem({ value, startsOn: input.startsOn, endsOn: input.endsOn, escalation: input.escalation, plan });
    if (problem) throw new BadRequestException(problem);
    const file = await this.repo.file(input.fileId);
    if (file?.mime !== PDF) throw new BadRequestException("ملف العقد لازم يبقى PDF");

    const created = await this.db.$transaction(async (tx) => {
      const [{ n }] = (await this.repo.nextCode(tx)) as [{ n: bigint }];
      const data = {
        code: `C-${n}`, dealId: deal.id, startsOn: new Date(input.startsOn), endsOn: new Date(input.endsOn), value: toDecimal(value),
        escalation: input.escalation, fileId: input.fileId, createdById: me.id,
      };
      const c = await this.repo.create(tx, { ...data, installments: { create: plan.map((x) => ({ dueOn: new Date(x.dueOn), amount: toDecimal(x.amount) })) } });
      await this.files.attach(me, [input.fileId], FILE_ENTITY, c.id, tx);
      await this.audit.record({ module: "contracts", entity: "Contract", entityId: c.id, action: "create", userId: me.id,
        after: { ...data, startsOn: input.startsOn, endsOn: input.endsOn, installments: plan.map((x) => ({ dueOn: x.dueOn, amount: toDecimal(x.amount) })) } }, tx);
      return c;
    });
    return this.get(me, created.id);
  }
}

/** C-501-1 = the first payment on installment 1 of C-501 (the demo's number); a second payment on it is C-501-1/2. */
const receiptNo = (code: string, k: number, n: number) => `${code}-${k + 1}${n ? `/${n + 1}` : ""}`;
const paymentReceiptNo = (p: PaymentRecord) =>
  receiptNo(p.installment.contract.code, p.installment.contract.installments.findIndex((x) => x.id === p.installment.id), p.installment.payments.findIndex((x) => x.id === p.id));

/**
 * M-09 field permissions: a hidden field's value never leaves the API — blank in the row (its kind kept, so the screens
 * show «—»). The code, the parties, the unit and the dates are the contract's identity and always stay.
 */
function hideRow<T extends ContractRow>(r: T, h: ReadonlySet<string>): T {
  if (!h.size) return r;
  return { ...r, value: h.has("value") ? "" : r.value, escalation: h.has("escalation") ? 0 : r.escalation, paid: h.has("paid") ? "" : r.paid };
}

function hideDetail(d: ContractDetail, h: ReadonlySet<string>): ContractDetail {
  if (!h.size) return d;
  return {
    ...hideRow(d, h),
    nextYearValue: h.has("nextYearValue") ? "" : d.nextYearValue, pending: h.has("pending") ? null : d.pending,
    file: h.has("file") ? null : d.file, penalty: h.has("penalty") ? null : d.penalty,
    installments: h.has("installments") ? [] : h.has("paid") ? d.installments.map((i) => ({ ...i, paid: "", payments: [] })) : d.installments,
  };
}

const addDays = (today: string, n: number) => day(new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86_400_000));

function toRow(c: ContractRecord, today: string): ContractRow {
  const status = label(c.status), endsOn = day(c.endsOn);
  const paid = c.installments.reduce((s, i) => s + fromDecimal(i.paid.toFixed(2)), 0);
  return {
    id: c.id, code: c.code, dealId: c.deal.id, dealCode: c.deal.code, client: c.deal.company, unitCode: c.deal.unit.code,
    startsOn: day(c.startsOn), endsOn, value: c.value.toFixed(2), escalation: Number(c.escalation), status,
    endingSoon: endingSoon(status, endsOn, today), daysLeft: daysBetween(today, endsOn), paid: toDecimal(paid),
  };
}
