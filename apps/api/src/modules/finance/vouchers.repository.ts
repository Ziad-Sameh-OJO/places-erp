import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";
import type { Tx } from "./ledger.repository";

const SIDE = { select: { id: true, code: true, name: true } } as const;
const BUDGET = { id: true, accountId: true, budget: true, period: true, alert: true, active: true, ownerId: true } as const;
const BILL = { include: { months: true } } as const;
export type BillRow = Prisma.RecurringBillGetPayload<typeof BILL>;
export const MOVE_INCLUDE = { from: SIDE, to: SIDE, account: SIDE } as const;
export type MoveRow = Prisma.TreasuryMoveGetPayload<{ include: typeof MOVE_INCLUDE }>;

/** Prisma only: treasury vouchers, the budget lines and the sums behind «اتصرف». No decisions here. */
@Injectable()
export class VouchersRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  createMove(data: Prisma.TreasuryMoveUncheckedCreateInput, tx: Tx) {
    return tx.treasuryMove.create({ data, include: MOVE_INCLUDE });
  }

  moves(f: { accountId?: string | undefined; kind?: string | undefined; page: number; pageSize: number }) {
    const where: Prisma.TreasuryMoveWhereInput = {
      ...(f.accountId ? { OR: [{ fromId: f.accountId }, { toId: f.accountId }, { accountId: f.accountId }] } : {}),
      ...(f.kind ? { kind: f.kind } : {}),
    };
    return this.db.$transaction([
      this.db.treasuryMove.findMany({ where, include: MOVE_INCLUDE, orderBy: [{ date: "desc" }, { no: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.treasuryMove.count({ where }),
    ]);
  }

  move(id: string) {
    return this.db.treasuryMove.findUnique({ where: { id }, include: MOVE_INCLUDE });
  }

  entryNo(entryIds: string[]) {
    return this.db.journalEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, no: true } });
  }

  movesOn(day: Date) {
    return this.db.treasuryMove.findMany({ where: { date: day }, select: { kind: true, amount: true } });
  }

  people() {
    return this.db.employee.findMany({ where: { user: { status: "ACTIVE" } }, select: { userId: true, name: true }, orderBy: { name: "asc" } });
  }

  person(userId: string, tx: Tx) {
    return tx.employee.findFirst({ where: { userId, user: { status: "ACTIVE" } }, select: { userId: true, name: true } });
  }

  holders(parentCode: string) {
    return this.db.account.findMany({ where: { parent: { code: parentCode }, archivedAt: null }, select: { id: true, code: true, name: true, holderId: true }, orderBy: { code: "asc" } });
  }

  budgets(tx: Tx | PrismaClient = this.db) {
    return tx.budgetLine.findMany({ where: { accountId: { not: null } }, select: BUDGET });
  }

  budgetOf(accountId: string, tx: Tx | PrismaClient = this.db) {
    return tx.budgetLine.findUnique({ where: { accountId }, select: BUDGET });
  }

  upsertBudget(accountId: string, name: string, kind: string, data: { budget?: string; period?: string; alert?: number; active?: boolean; ownerId?: string | null }, tx: Tx) {
    return tx.budgetLine.upsert({
      where: { accountId },
      create: { accountId, name, kind, ...data, budget: data.budget ?? "0" },
      update: data,
    });
  }

  /** Debit and credit per account from a day on (the budget's period). */
  sumsSince(accountIds: string[], from: Date, tx: Tx | PrismaClient = this.db) {
    return tx.journalLine.groupBy({ by: ["accountId"], where: { accountId: { in: accountIds }, entry: { date: { gte: from } } }, _sum: { debit: true, credit: true } });
  }

  /* ---- recurring bills (9.16) ---- */
  bills() {
    return this.db.recurringBill.findMany({ ...BILL, orderBy: [{ day: "asc" }, { name: "asc" }] });
  }

  bill(id: string, tx: Tx | PrismaClient = this.db) {
    return tx.recurringBill.findUnique({ where: { id }, ...BILL });
  }

  createBill(data: Prisma.RecurringBillUncheckedCreateInput, tx: Tx) {
    return tx.recurringBill.create({ data });
  }

  setBillActive(id: string, active: boolean, tx: Tx) {
    return tx.recurringBill.update({ where: { id }, data: { active } });
  }

  /** paid / skipped this month: unique per bill and month, so a second payment of the same month fails. */
  markBill(data: { billId: string; month: string; status: string; moveId?: string; reason?: string; byId: string }, tx: Tx) {
    return tx.recurringBillMonth.create({ data });
  }

  accountsByIds(ids: string[]) {
    return this.db.account.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } });
  }

  movesByIds(ids: string[]) {
    return this.db.treasuryMove.findMany({ where: { id: { in: ids } }, select: { id: true, no: true } });
  }
}
