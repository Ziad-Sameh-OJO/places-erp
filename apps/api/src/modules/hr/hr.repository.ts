import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";
import { ADVANCES_PARENT, fromDecimal } from "@places/domain";

export type Tx = Prisma.TransactionClient;
const FILE = { include: { user: { select: { email: true } }, manager: { select: { id: true, name: true } } } } as const;
export type EmployeeRowDb = Prisma.EmployeeGetPayload<typeof FILE>;

/** Prisma only: the employee file. No decisions here. */
@Injectable()
export class HrRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  employees(where: Prisma.EmployeeWhereInput) {
    return this.db.employee.findMany({ where: { AND: [{ user: { status: { not: "DISABLED" } } }, where] }, ...FILE, orderBy: { name: "asc" } });
  }

  /** 7.16: the month's late minutes and deduction days (YYYY-MM). */
  async attendanceMonth(employeeId: string, month: string) {
    const from = new Date(`${month}-01T00:00:00Z`), to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const s = await this.db.attendanceDay.aggregate({ where: { employeeId, day: { gte: from, lt: to } }, _sum: { lateMinutes: true, deduction: true } });
    return { lateMinutes: s._sum.lateMinutes ?? 0, deductionDays: Number(s._sum.deduction ?? 0) };
  }

  /** 7.16: the month's Excuses that count (the ones the next Excuse's number counts — rejected / refused don't). */
  excusesMonth(employeeId: string, month: string) {
    const from = new Date(`${month}-01T00:00:00Z`), to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    return this.db.excuseRequest.count({ where: { employeeId, day: { gte: from, lt: to }, status: { in: ["pending_tl", "approved_tl", "confirmed"] } } });
  }

  /**
   * 7.16 «سلفة»: what's still owed on the person's advances account (131…, debit balance) in piasters. Finance's module
   * imports HR (payroll), so the file reads the balance here instead of through LedgerService.
   */
  async advanceOwed(userId: string): Promise<number> {
    const acc = await this.db.account.findFirst({ where: { parent: { code: ADVANCES_PARENT }, holderId: userId }, select: { id: true } });
    if (!acc) return 0;
    const s = await this.db.journalLine.aggregate({ where: { accountId: acc.id }, _sum: { debit: true, credit: true } });
    return fromDecimal((s._sum.debit ?? 0).toFixed(2)) - fromDecimal((s._sum.credit ?? 0).toFixed(2));
  }

  departments(where: Prisma.EmployeeWhereInput) {
    return this.db.employee.findMany({ where, distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } });
  }

  employee(id: string, where: Prisma.EmployeeWhereInput, tx: Tx | PrismaClient = this.db) {
    return tx.employee.findFirst({ where: { AND: [{ id }, where] }, ...FILE }); // AND: a scope on `id` (team) mustn't replace the id asked for
  }

  update(id: string, data: Prisma.EmployeeUncheckedUpdateInput, tx: Tx) {
    return tx.employee.update({ where: { id }, data, ...FILE });
  }
}
