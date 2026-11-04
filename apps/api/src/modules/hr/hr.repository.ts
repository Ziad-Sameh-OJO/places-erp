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
