import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

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

  /** 7.15: each employee's last 1-to-1 day and the due days of their open «حل HR». */
  oneOnOnes(ids: string[]) {
    return Promise.all([
      this.db.oneOnOne.groupBy({ by: ["employeeId"], where: { employeeId: { in: ids } }, _max: { heldOn: true } }),
      this.db.oneOnOne.findMany({ where: { employeeId: { in: ids }, hrAction: { not: null }, hrActionDone: false, hrActionDue: { not: null } }, select: { employeeId: true, hrActionDue: true } }),
    ]);
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
