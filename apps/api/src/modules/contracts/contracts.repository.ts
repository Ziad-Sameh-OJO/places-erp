import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { ContractFilters } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";

export const CONTRACT_ROW = {
  id: true, code: true, startsOn: true, endsOn: true, value: true, escalation: true, status: true, fileId: true, createdAt: true,
  deal: { select: { id: true, code: true, company: true, unit: { select: { code: true } } } },
  installments: {
    select: { id: true, dueOn: true, amount: true, paid: true, payments: { select: { id: true, amount: true, paidOn: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    orderBy: [{ dueOn: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ContractSelect;
const PAYMENT = {
  id: true, amount: true, paidOn: true,
  installment: {
    select: {
      id: true, dueOn: true, payments: { select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      contract: { select: { id: true, code: true, installments: { select: { id: true }, orderBy: [{ dueOn: "asc" }, { id: "asc" }] }, deal: { select: { company: true, location: true, unit: { select: { code: true } } } } } },
    },
  },
} satisfies Prisma.InstallmentPaymentSelect;
export type PaymentRecord = Prisma.InstallmentPaymentGetPayload<{ select: typeof PAYMENT }>;
export type ContractRecord = Prisma.ContractGetPayload<{ select: typeof CONTRACT_ROW }>;

/** Prisma only (M-11). The data scope comes in as a `where` built by the service. */
@Injectable()
export class ContractsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list(scope: Prisma.ContractWhereInput, f: ContractFilters, extra: Prisma.ContractWhereInput) {
    const where: Prisma.ContractWhereInput = { AND: [scope, extra, search(f.q)] };
    return this.db.$transaction([
      this.db.contract.findMany({ where, select: CONTRACT_ROW, orderBy: [{ endsOn: "asc" }, { id: "asc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.contract.count({ where }),
    ]);
  }

  detail(scope: Prisma.ContractWhereInput, id: string) {
    return this.db.contract.findFirst({ where: { AND: [scope, { id }] }, select: CONTRACT_ROW });
  }

  /** Everything the summary counts, in scope (contracts are few: one per deal). */
  forSummary(scope: Prisma.ContractWhereInput) {
    return this.db.contract.findMany({ where: scope, select: CONTRACT_ROW });
  }

  /** The month's installments and contract ends (M-11 5.3 calendar). */
  month(scope: Prisma.ContractWhereInput, from: Date, to: Date) {
    return this.db.$transaction([
      this.db.installment.findMany({
        where: { dueOn: { gte: from, lte: to }, contract: scope },
        select: { dueOn: true, amount: true, paid: true, contract: { select: { id: true, code: true, deal: { select: { company: true } } } } }, orderBy: { dueOn: "asc" },
      }),
      this.db.contract.findMany({ where: { AND: [scope, { endsOn: { gte: from, lte: to } }] }, select: { id: true, code: true, endsOn: true, deal: { select: { company: true } } } }),
    ]);
  }

  existsForDeal(dealId: string) {
    return this.db.contract.count({ where: { dealId } });
  }

  nextCode(tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('finance.contract_code_seq') AS n`; // created by the 6.1 migration
  }

  create(tx: Prisma.TransactionClient, data: Prisma.ContractUncheckedCreateInput) {
    return tx.contract.create({ data, select: { id: true, code: true } });
  }

  /** An installment in scope, with what the payment and its audit need (read inside the payment's transaction). */
  installment(tx: Prisma.TransactionClient, scope: Prisma.ContractWhereInput, id: string) {
    return tx.installment.findFirst({ where: { id, contract: scope }, select: { id: true, dueOn: true, amount: true, paid: true, contractId: true } });
  }

  /** paid += amount, only if nobody paid meanwhile (two clicks never add the same payment twice). */
  setPaid(tx: Prisma.TransactionClient, id: string, before: Prisma.Decimal, after: string) {
    return tx.installment.updateMany({ where: { id, paid: before }, data: { paid: after } });
  }

  addPayment(tx: Prisma.TransactionClient, data: Prisma.InstallmentPaymentUncheckedCreateInput) {
    return tx.installmentPayment.create({ data, select: { id: true } });
  }

  /** A payment in scope with its contract (the receipt). */
  payment(scope: Prisma.ContractWhereInput, id: string) {
    return this.db.installmentPayment.findFirst({ where: { id, installment: { contract: scope } }, select: PAYMENT });
  }

  /** The month's payments, and the installments that fell due in it (M-11 6.1 «تقرير التحصيل»). */
  collections(scope: Prisma.ContractWhereInput, from: Date, to: Date) {
    return this.db.$transaction([
      this.db.installmentPayment.findMany({ where: { paidOn: { gte: from, lte: to }, installment: { contract: scope } }, select: PAYMENT, orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }] }),
      this.db.installment.aggregate({ where: { dueOn: { gte: from, lte: to }, contract: scope }, _sum: { amount: true } }),
    ]);
  }

  file(id: string) {
    return this.db.file.findUnique({ where: { id }, select: { id: true, name: true, mime: true } });
  }
}

/** By contract code, client (the deal's company) or unit code (M-11 5.2). */
function search(q: string | undefined): Prisma.ContractWhereInput {
  if (!q) return {};
  const has = { contains: q, mode: "insensitive" } as const;
  return { OR: [{ code: has }, { deal: { company: has } }, { deal: { code: has } }, { deal: { unit: { code: has } } }] };
}
