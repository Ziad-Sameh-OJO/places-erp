import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { type Action, type DataScope, type ModuleKey, effectiveGrants } from "@places/domain";
import { PRISMA } from "../database/database.module";
import type { CurrentUser } from "../auth/current-user.decorator";

/** Turns the database's roles + per-person overrides into the domain's Grants (same rule the demo used). */
@Injectable()
export class GrantsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  async currentUser(userId: string): Promise<CurrentUser> {
    const u = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: { include: { permissions: true } } } }, overrides: true, employee: { include: { teamMembers: { select: { id: true } } } } },
    });
    const roles = u.roles.map(({ role }) => ({
      scope: role.scope.toLowerCase() as DataScope,
      modules: Object.fromEntries(role.permissions.map((p) => [p.module, p.actions as Action[]])) as Partial<Record<ModuleKey, Action[]>>,
    }));
    const overrides = Object.fromEntries(u.overrides.map((o) => [o.module, o.actions as Action[]])) as Partial<Record<ModuleKey, Action[]>>;
    return {
      id: u.id,
      name: u.employee?.name ?? u.email,
      employeeId: u.employee?.id ?? null,
      grants: effectiveGrants(roles, overrides),
      teamIds: u.employee ? [u.employee.id, ...u.employee.teamMembers.map((m) => m.id)] : [],
      department: u.employee?.department ?? null,
    };
  }
}
