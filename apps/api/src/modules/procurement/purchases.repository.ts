import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { PurchaseFilters } from "@places/contracts";
import { dayStart } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

export type Tx = Prisma.TransactionClient;
export const PURCHASE = {
  id: true, no: true, item: true, amount: true, vendor: true, attachments: true, status: true, accountId: true,
  account: { select: { id: true, code: true, name: true } }, paidFrom: { select: { id: true, name: true } }, move: { select: { id: true, no: true } },
  createdById: true, createdAt: true, decidedById: true, decidedAt: true, rejectReason: true, settledAt: true, postedAt: true,
} as const;
export type PurchaseRow = Prisma.PurchaseGetPayload<{ select: typeof PURCHASE }>;
/** The data scope (M-08 4.1): `{}` for everyone who sees all requests, the requester's own otherwise. */
export type Scope = { createdById?: string };

const DAY_MS = 86_400_000;

/** Prisma only, for purchase requests (10.1–10.3). */
@Injectable()
export class PurchasesRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list(f: PurchaseFilters, scope: Scope) {
    const where: Prisma.PurchaseWhereInput = {
      ...scope,
      ...(f.status ? { status: f.status } : {}),
      ...(f.accountId ? { accountId: f.accountId } : {}),
      ...(f.group ? { account: { code: { startsWith: f.group } } } : {}),
      ...(f.vendor ? { vendor: f.vendor } : {}),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: dayStart(f.from) } : {}), ...(f.to ? { lt: new Date(dayStart(f.to).getTime() + DAY_MS) } : {}) } } : {}),
    };
    return this.db.$transaction([
      this.db.purchase.findMany({ where, select: PURCHASE, orderBy: { no: "desc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.purchase.count({ where }),
    ]);
  }

  find(id: string, scope: Scope, tx: Tx | PrismaClient = this.db) {
    return tx.purchase.findFirst({ where: { id, ...scope }, select: PURCHASE });
  }

  settled() {
    return this.db.purchase.findMany({ where: { status: "Settled" }, select: PURCHASE, orderBy: { settledAt: "asc" } });
  }

  counts(scope: Scope) {
    return this.db.purchase.groupBy({ by: ["status"], where: scope, _count: true });
  }

  /** KPI M-12 «اتنفذ خلال 48 ساعة»: when each request was sent and settled. */
  settledTimes(scope: Scope) {
    return this.db.purchase.findMany({ where: { ...scope, settledAt: { not: null } }, select: { createdAt: true, settledAt: true } });
  }

  create(data: Prisma.PurchaseUncheckedCreateInput, tx: Tx) {
    return tx.purchase.create({ data, select: PURCHASE });
  }

  /** Moves a request on only if it is still where the caller saw it, so two people can't act on it at once. */
  async move(id: string, from: { status: string; amount?: string }, data: Prisma.PurchaseUncheckedUpdateManyInput, tx: Tx) {
    return (await tx.purchase.updateMany({ where: { id, status: from.status, ...(from.amount ? { amount: from.amount } : {}) }, data })).count === 1;
  }

  names(userIds: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } });
  }
}
