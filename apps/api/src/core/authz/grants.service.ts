import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { type Action, type DataScope, type FieldMode, type FieldRules, type ModuleKey, effectiveGrants, fieldAccess, gateReports, mergeFieldRules } from "@places/domain";
import { PRISMA } from "../database/database.module";
import type { CurrentUser } from "../auth/current-user.decorator";

/** Turns the database's roles + per-person overrides into the domain's Grants (same rule the demo used). */
@Injectable()
export class GrantsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /** `db` can be a transaction, so a change can be checked (e.g. «don't lock yourself out») before it commits. */
  async currentUser(userId: string, db: Pick<PrismaClient, "user"> = this.db): Promise<CurrentUser> {
    const u = await db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: { include: { permissions: true, fieldRules: true } } } }, overrides: true, reportsAccess: { select: { userId: true } }, employee: { include: { teamMembers: { select: { id: true } } } } },
    });
    const roles = u.roles.map(({ role }) => ({
      scope: role.scope.toLowerCase() as DataScope,
      modules: Object.fromEntries(role.permissions.map((p) => [p.module, p.actions as Action[]])) as Partial<Record<ModuleKey, Action[]>>,
    }));
    // M-09 field permissions: each role's «read» / «hide» fields, merged the most permissive way
    const fieldRules = mergeFieldRules(u.roles.map(({ role }) => {
      const r: Partial<Record<ModuleKey, Record<string, FieldMode>>> = {};
      for (const f of role.fieldRules) (r[f.module as ModuleKey] ??= {})[f.field] = f.mode as FieldMode;
      return r as FieldRules;
    }));
    const overrides = Object.fromEntries(u.overrides.map((o) => [o.module, o.actions as Action[]])) as Partial<Record<ModuleKey, Action[]>>;
    return {
      id: u.id,
      name: u.employee?.name ?? u.email,
      email: u.email,
      emailNotifications: u.emailNotifications,
      roles: [...u.roles].sort((a, b) => Number(b.primary) - Number(a.primary)).map(({ role }) => role.key),
      roleLabels: [...u.roles].sort((a, b) => Number(b.primary) - Number(a.primary)).map(({ role }) => role.label),
      employeeId: u.employee?.id ?? null,
      // 11.20: «التقارير والتارجت» is the heads' and whoever they listed, whatever the roles say
      grants: gateReports(effectiveGrants(roles, overrides), u.roles.map(({ role }) => role.key), !!u.reportsAccess),
      fieldRules,
      fields: fieldAccess(fieldRules),
      teamIds: u.employee ? [u.employee.id, ...u.employee.teamMembers.map((m) => m.id)] : [],
      department: u.employee?.department ?? null,
    };
  }
}
