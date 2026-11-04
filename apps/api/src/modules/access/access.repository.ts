import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { AuditFilters, UserFilters } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";

const USER_ROW = {
  id: true, email: true, phone: true, status: true, otpRequired: true, lastLoginAt: true, endDate: true, failedLogins: true,
  roles: { select: { primary: true, role: { select: { key: true, label: true } } } },
  employee: { select: { id: true, name: true, department: true, jobTitle: true, team: true, teamLeaderId: true } },
  _count: { select: { overrides: true } },
} satisfies Prisma.UserSelect;

/** Reads for M-09. Writes happen in the service, inside transactions that also write the audit trail. */
@Injectable()
export class AccessRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  listUsers(f: UserFilters) {
    const where = userWhere(f);
    return this.db.$transaction([
      this.db.user.findMany({ where, select: USER_ROW, orderBy: { employee: { name: "asc" } }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.user.count({ where }),
    ]);
  }

  /** Same filters, every row (the Excel export), capped by the caller. */
  allUsers(f: UserFilters, take: number) {
    return this.db.user.findMany({ where: userWhere(f), select: USER_ROW, orderBy: { employee: { name: "asc" } }, take });
  }

  user(id: string) {
    return this.db.user.findUnique({ where: { id }, select: { ...USER_ROW, overrides: { select: { module: true, actions: true } } } });
  }

  roles() {
    return this.db.role.findMany({ include: { permissions: true, _count: { select: { users: true } } }, orderBy: [{ builtIn: "desc" }, { createdAt: "asc" }] });
  }

  rolesByKey(keys: string[]) {
    return this.db.role.findMany({ where: { key: { in: keys } }, include: { permissions: true } });
  }

  audit(f: AuditFilters) {
    const where: Prisma.AuditLogWhereInput = { ...(f.module ? { module: f.module } : {}), ...(f.entityId ? { entityId: f.entityId } : {}) };
    return this.db.$transaction([
      this.db.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.auditLog.count({ where }),
    ]);
  }
}

const userWhere = (f: UserFilters): Prisma.UserWhereInput => ({
  AND: [
    f.status ? { status: f.status } : {},
    f.role ? { roles: { some: { role: { key: f.role } } } } : {},
    f.q ? { OR: [{ email: { contains: f.q, mode: "insensitive" } }, { employee: { name: { contains: f.q, mode: "insensitive" } } }] } : {},
  ],
});
