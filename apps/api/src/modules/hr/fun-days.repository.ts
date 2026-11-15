import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

/** The events a person of `department` is invited to: the ones for everyone, or for his department. */
export const forDepartment = (department: string | null): Prisma.CompanyEventWhereInput =>
  ({ OR: [{ departments: { isEmpty: true } }, ...(department ? [{ departments: { has: department } }] : [])] });

/** Prisma only: M-05 fun days. */
@Injectable()
export class FunDaysRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  events(where: Prisma.CompanyEventWhereInput, take?: number) {
    return this.db.companyEvent.findMany({ where, orderBy: [{ date: "asc" }, { time: "asc" }], ...(take ? { take } : {}) });
  }

  departments() {
    return this.db.employee.findMany({ where: { user: { status: "ACTIVE" } }, distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } });
  }

  /** Active people the event is for (no departments = everyone). */
  invited(departments: string[]) {
    return this.db.user.findMany({ where: { status: "ACTIVE", ...(departments.length ? { employee: { department: { in: departments } } } : {}) }, select: { id: true } });
  }
}
