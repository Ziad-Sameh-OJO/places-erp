import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { AuditFilters, UserFilters } from "@places/contracts";
import { dayStart } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

const USER_ROW = {
  id: true, email: true, phone: true, status: true, otpRequired: true, lastLoginAt: true, endDate: true, failedLogins: true,
  roles: { select: { primary: true, role: { select: { key: true, label: true } } } },
  employee: { select: { id: true, name: true, department: true, jobTitle: true, team: true, teamLeaderId: true, managerId: true } },
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

  departments() {
    return this.db.employee.findMany({ distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } });
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
    const where = auditWhere(f);
    return this.db.$transaction([
      this.db.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.auditLog.count({ where }),
    ]);
  }

  /** Same filters, every row (the Excel export), capped by the caller. */
  allAudit(f: AuditFilters, take: number) {
    return this.db.auditLog.findMany({ where: auditWhere(f), orderBy: { at: "desc" }, take });
  }

  /** Who each account is, for the log's «مين» and «على» columns. */
  names() {
    return this.db.employee.findMany({ select: { userId: true, name: true } });
  }

  /** The org structure (M-09 7.2), for «his team». */
  org() {
    return this.db.employee.findMany({ select: { id: true, userId: true, managerId: true } });
  }

  /** «مين عنده أنهي صلاحية»: everyone who can sign in or is about to, with their roles' matrices and exceptions. */
  permissionHolders() {
    return this.db.user.findMany({
      where: { status: { not: "DISABLED" } },
      select: {
        id: true, email: true, status: true, overrides: { select: { module: true, actions: true } },
        employee: { select: { name: true, department: true } },
        roles: { orderBy: { primary: "desc" }, select: { role: { select: { label: true, scope: true, permissions: { select: { module: true, actions: true } } } } } },
      },
      orderBy: { employee: { name: "asc" } },
    });
  }
}

const auditWhere = (f: AuditFilters): Prisma.AuditLogWhereInput => ({
  ...(f.module ? { module: f.module } : {}),
  ...(f.entityId ? { entityId: f.entityId } : {}),
  ...(f.userId ? { userId: f.userId } : {}),
  // Cairo calendar days: from the start of `from` to the end of `to`
  ...(f.from || f.to ? { at: { ...(f.from ? { gte: dayStart(f.from) } : {}), ...(f.to ? { lt: dayStart(nextDay(f.to)) } : {}) } } : {}),
});
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

const userWhere = (f: UserFilters): Prisma.UserWhereInput => ({
  AND: [
    f.status ? { status: f.status } : {},
    f.role ? { roles: { some: { role: { key: f.role } } } } : {},
    f.department ? { employee: { department: { equals: f.department, mode: "insensitive" } } } : {},
    f.q ? { OR: searchText(f.q) } : {},
  ],
});

/** M-09 5.2: name, email, mobile or department. A mobile typed with spaces or dashes still matches its digits. */
const searchText = (q: string): Prisma.UserWhereInput[] => {
  const digits = q.replace(/\D/g, "");
  return [
    { email: { contains: q, mode: "insensitive" } },
    { phone: { contains: q } },
    ...(digits.length >= 3 && digits !== q ? [{ phone: { contains: digits } }] : []),
    { employee: { name: { contains: q, mode: "insensitive" } } },
    { employee: { department: { contains: q, mode: "insensitive" } } },
  ];
};
