import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CalendarItem, ContractCalendar, ContractDetail, ContractFilters, ContractForm, ContractRow, ContractSummary, CreateContract, Paged } from "@places/contracts";
import {
  type ContractStatus, type InstallmentLine, RENEWAL_WINDOW_DAYS, agingBuckets, contractProblem, daysBetween, endingSoon, fromDecimal,
  installmentPlan, installmentState, localDate, nextYearValue, toDecimal,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { FilesService } from "../../core/files/files.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { DealsService } from "../deals/deals.service";
import { type ContractRecord, ContractsRepository } from "./contracts.repository";

const NO_CONTRACT = "العقد ده مش موجود";
const FILE_ENTITY = "Contract";
const PDF = "application/pdf";
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
    return { items: rows.map((r) => toRow(r, today)), total, page: f.page, pageSize: f.pageSize };
  }

  async get(me: CurrentUser, id: string, now = new Date()): Promise<ContractDetail> {
    const c = await this.repo.detail(this.scope(me), id);
    if (!c) throw new NotFoundException(NO_CONTRACT);
    const today = localDate(now);
    return {
      ...toRow(c, today), createdAt: c.createdAt.toISOString(),
      nextYearValue: toDecimal(nextYearValue(fromDecimal(c.value.toFixed(2)), Number(c.escalation))),
      file: c.fileId ? await this.repo.file(c.fileId).then((f) => f && { id: f.id, name: f.name }) : null,
      installments: c.installments.map((i) => {
        const amount = fromDecimal(i.amount.toFixed(2)), paid = fromDecimal(i.paid.toFixed(2));
        return { id: i.id, dueOn: day(i.dueOn), amount: toDecimal(amount), paid: toDecimal(paid), state: installmentState({ dueOn: day(i.dueOn), amount, paid }, today) };
      }),
    };
  }

  /** The demo's tiles (active · ending · late installments · collected), the renewals card and the Aging (M-11 5.1 · 6.1). */
  async summary(me: CurrentUser, now = new Date()): Promise<ContractSummary> {
    const today = localDate(now);
    const all = await this.repo.forSummary(this.scope(me));
    const lines = all.filter((c) => c.status === "ACTIVE").flatMap((c) => c.installments.map((i) => ({ dueOn: day(i.dueOn), amount: fromDecimal(i.amount.toFixed(2)), paid: fromDecimal(i.paid.toFixed(2)) })));
    const late = lines.filter((l) => l.paid < l.amount && l.dueOn < today);
    const rows = all.map((c) => toRow(c, today));
    const renewals = rows.filter((r) => r.endingSoon).sort((a, b) => a.daysLeft - b.daysLeft);
    return {
      active: rows.filter((r) => r.status === "Active").length, endingSoon: renewals.length,
      late: { count: late.length, amount: toDecimal(late.reduce((s, l) => s + l.amount - l.paid, 0)) },
      paid: toDecimal(rows.reduce((s, r) => s + fromDecimal(r.paid), 0)),
      aging: agingBuckets(lines, today).map(toDecimal) as ContractSummary["aging"], renewals: renewals.slice(0, 10),
    };
  }

  /** M-11 5.3: the month's installments (with their state) and contract ends, by day. */
  async calendar(me: CurrentUser, month: string, now = new Date()): Promise<ContractCalendar> {
    const today = localDate(now);
    const from = new Date(`${month}-01T00:00:00Z`), to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    const [installments, ends] = await this.repo.month(this.scope(me), from, to);
    const byDay: Record<string, CalendarItem[]> = {};
    const add = (d: Date, item: CalendarItem) => (byDay[day(d)] ??= []).push(item);
    for (const i of installments) {
      const amount = fromDecimal(i.amount.toFixed(2)), paid = fromDecimal(i.paid.toFixed(2));
      add(i.dueOn, { contractId: i.contract.id, code: i.contract.code, client: i.contract.deal.company, kind: "installment", amount: toDecimal(amount), state: installmentState({ dueOn: day(i.dueOn), amount, paid }, today) });
    }
    for (const c of ends) add(c.endsOn, { contractId: c.id, code: c.code, client: c.deal.company, kind: "end", amount: null, state: null });
    return { month, byDay };
  }

  async form(me: CurrentUser): Promise<ContractForm> {
    return { deals: await this.deals.contractable(me) };
  }

  /** The signed PDF: whoever may see the contract. */
  async fileUrl(me: CurrentUser, id: string) {
    const c = await this.repo.detail(this.scope(me), id);
    if (!c?.fileId) throw new NotFoundException(NO_CONTRACT);
    return this.files.downloadUrl(c.fileId);
  }

  /**
   * M-11 2.1 steps 1–2: the contract is uploaded on an approved deal of the caller's (one per deal), with its PDF; the
   * system builds the installment table (value ÷ count, M-11 3.2) unless it's written line by line.
   */
  async create(me: CurrentUser, input: CreateContract): Promise<ContractDetail> {
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
