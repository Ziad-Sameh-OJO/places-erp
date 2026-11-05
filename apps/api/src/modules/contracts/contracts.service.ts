import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { ContractDetail, ContractFilters, ContractRow, CreateContract, Paged } from "@places/contracts";
import {
  type ContractStatus, type InstallmentLine, RENEWAL_WINDOW_DAYS, contractProblem, daysBetween, endingSoon, fromDecimal,
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
