import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { AuditFilters, Matrix, Overrides, RoleInput, RoleUpdate, UserFilters, UserInput } from "@places/contracts";
import { type Action, MODULES, keepsAccessAdmin, normalizeActions } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { AuthService } from "../../core/auth/auth.service";
import { GrantsService } from "../../core/authz/grants.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { AccessRepository } from "./access.repository";

type Tx = Prisma.TransactionClient;
const ADMIN = "admin";

/**
 * M-09 use cases. Three rules on top of the permission check of each endpoint:
 *  - only a Super Admin can give or take the Super Admin role;
 *  - nobody can remove their own right to manage permissions (the change is rolled back);
 *  - built-in roles and roles that still have people can't be deleted.
 */
@Injectable()
export class AccessService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: AccessRepository,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly grants: GrantsService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ---------------- users ---------------- */

  async listUsers(f: UserFilters) {
    const [items, total] = await this.repo.listUsers(f);
    return { items, total, page: f.page, pageSize: f.pageSize };
  }

  async getUser(id: string) {
    const u = await this.repo.user(id);
    if (!u) throw new NotFoundException();
    return u;
  }

  async createUser(me: CurrentUser, b: UserInput) {
    const roleKeys = this.roleKeys(me, b, []);
    const roles = await this.checkRoles(roleKeys);
    if (await this.db.user.findUnique({ where: { email: b.email } })) throw new ConflictException("الإيميل ده عليه حساب قبل كده");
    const user = await this.db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email: b.email, phone: b.phone ?? null, otpRequired: b.otpRequired, endDate: b.endDate ?? null } });
      await tx.userRole.createMany({ data: roleKeys.map((k, i) => ({ userId: u.id, roleId: roles.get(k)!.id, primary: i === 0 })) });
      // every account gets its HR file; salary and target are filled in by HR (M-05)
      await tx.employee.create({ data: { userId: u.id, ...this.employeeData(b, roles.get(roleKeys[0]!)!.label), salary: 0 } });
      await this.audit.record({ module: "access", entity: "User", entityId: u.id, action: "create", userId: me.id, after: { ...b, email: b.email } }, tx);
      return u;
    });
    await this.auth.sendInvite(user.id, user.email, roles.get(roleKeys[0]!)!.label);
    return this.getUser(user.id);
  }

  async updateUser(me: CurrentUser, id: string, b: UserInput) {
    const before = await this.getUser(id);
    const roleKeys = this.roleKeys(me, b, before.roles.map((r) => r.role.key));
    const roles = await this.checkRoles(roleKeys);
    const clash = await this.db.user.findUnique({ where: { email: b.email } });
    if (clash && clash.id !== id) throw new ConflictException("الإيميل ده عليه حساب تاني");
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { email: b.email, phone: b.phone ?? null, otpRequired: b.otpRequired, endDate: b.endDate ?? null } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roleKeys.map((k, i) => ({ userId: id, roleId: roles.get(k)!.id, primary: i === 0 })) });
      await tx.employee.update({ where: { userId: id }, data: this.employeeData(b, roles.get(roleKeys[0]!)!.label) });
      await this.audit.record({ module: "access", entity: "User", entityId: id, action: "update", userId: me.id, before, after: b }, tx);
      await this.keepSelfAdmin(me, tx);
    });
    const was = before.roles.map((r) => r.role.key).join(",");
    if (was !== roleKeys.join(",")) await this.notifications.notify({ event: "access.changed", userIds: [id], text: `أدوارك اتغيرت: ${roleKeys.map((k) => roles.get(k)!.label).join(" + ")}` });
    return this.getUser(id);
  }

  /** Disabling signs the person out everywhere at once. (Phase 2: their open leads move to the next salesperson.) */
  async setActive(me: CurrentUser, id: string, active: boolean) {
    if (id === me.id && !active) throw new BadRequestException("مينفعش توقف حسابك");
    const u = await this.db.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException();
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: active ? { status: u.passwordHash ? "ACTIVE" : "INVITED", endDate: null, failedLogins: 0 } : { status: "DISABLED" } });
      if (!active) await tx.session.deleteMany({ where: { userId: id } });
      await this.audit.record({ module: "access", entity: "User", entityId: id, action: active ? "enable" : "disable", userId: me.id }, tx);
    });
  }

  async unlock(me: CurrentUser, id: string) {
    const r = await this.db.user.updateMany({ where: { id, status: "LOCKED" }, data: { status: "ACTIVE", failedLogins: 0 } });
    if (!r.count) throw new BadRequestException("الحساب مش مقفول");
    await this.audit.record({ module: "access", entity: "User", entityId: id, action: "unlock", userId: me.id });
  }

  async resendInvite(me: CurrentUser, id: string) {
    const u = await this.getUser(id);
    if (u.status !== "INVITED") throw new BadRequestException("الحساب متفعّل بالفعل");
    const primary = u.roles.find((r) => r.primary) ?? u.roles[0];
    await this.auth.sendInvite(id, u.email, primary?.role.label ?? "");
    await this.audit.record({ module: "access", entity: "User", entityId: id, action: "invite-resent", userId: me.id });
  }

  async sendReset(me: CurrentUser, id: string) {
    const u = await this.getUser(id);
    if (u.status === "DISABLED" || u.status === "INVITED") throw new BadRequestException("الحساب مش متفعّل");
    await this.auth.sendReset(id, u.email);
    await this.audit.record({ module: "access", entity: "User", entityId: id, action: "reset-sent", userId: me.id });
  }

  /** The person's matrix: what their roles give, their exceptions, and the result. */
  async permissionsOf(id: string) {
    const u = await this.getUser(id);
    const roles = await this.repo.rolesByKey(u.roles.map((r) => r.role.key));
    const fromRoles = Object.fromEntries(MODULES.map((m) => [m, normalizeActions(roles.flatMap((r) => (r.permissions.find((p) => p.module === m)?.actions ?? []) as Action[]))]));
    const overrides = Object.fromEntries(u.overrides.map((o) => [o.module, o.actions]));
    const effective = Object.fromEntries(MODULES.map((m) => [m, overrides[m] ?? fromRoles[m]]));
    return { roles: u.roles.map((r) => r.role), fromRoles, overrides, effective };
  }

  /** An exception equal to what the roles already give is dropped, so the matrix stays honest. */
  async setOverrides(me: CurrentUser, id: string, changes: Overrides) {
    const { fromRoles } = await this.permissionsOf(id);
    await this.db.$transaction(async (tx) => {
      for (const [module, actions] of Object.entries(changes)) {
        const norm = actions === null ? null : normalizeActions(actions);
        if (norm === null || norm.join() === (fromRoles[module] ?? []).join()) await tx.permissionOverride.deleteMany({ where: { userId: id, module } });
        else await tx.permissionOverride.upsert({ where: { userId_module: { userId: id, module } }, create: { userId: id, module, actions: norm }, update: { actions: norm } });
      }
      await this.audit.record({ module: "access", entity: "PermissionOverride", entityId: id, action: "update", userId: me.id, after: changes }, tx);
      await this.keepSelfAdmin(me, tx);
    });
    return this.permissionsOf(id);
  }

  /* ---------------- roles ---------------- */

  async listRoles() {
    return (await this.repo.roles()).map(({ permissions, _count, ...r }) => ({
      ...r, users: _count.users, permissions: Object.fromEntries(MODULES.map((m) => [m, permissions.find((p) => p.module === m)?.actions ?? []])),
    }));
  }

  async createRole(me: CurrentUser, b: RoleInput) {
    const from = b.copyFrom ? (await this.repo.rolesByKey([b.copyFrom]))[0] : null;
    if (b.copyFrom && !from) throw new BadRequestException("الدور اللي بتنسخ منه مش موجود");
    const key = `custom-${Date.now().toString(36)}`;
    const role = await this.db.$transaction(async (tx) => {
      const r = await tx.role.create({ data: { key, label: b.label, tier: b.tier, scope: up(b.scope), behavesLike: b.behavesLike ?? from?.behavesLike ?? from?.key ?? "sales" } });
      const perms = from ? from.permissions.map((p) => ({ roleId: r.id, module: p.module, actions: p.actions })) : [{ roleId: r.id, module: "home", actions: ["view"] }];
      await tx.rolePermission.createMany({ data: perms });
      await this.audit.record({ module: "access", entity: "Role", entityId: r.id, action: "create", userId: me.id, after: b }, tx);
      return r;
    });
    return role;
  }

  async updateRole(me: CurrentUser, key: string, b: RoleUpdate) {
    const r = await this.role(key);
    if (key === ADMIN && !me.roles.includes(ADMIN)) throw new ForbiddenException("دور الـ Super Admin بيتعدّل من Super Admin بس");
    await this.db.$transaction(async (tx) => {
      await tx.role.update({ where: { id: r.id }, data: { ...(b.label ? { label: b.label } : {}), ...(b.tier ? { tier: b.tier } : {}), ...(b.scope ? { scope: up(b.scope) } : {}) } });
      await this.audit.record({ module: "access", entity: "Role", entityId: r.id, action: "update", userId: me.id, before: { label: r.label, tier: r.tier, scope: r.scope }, after: b }, tx);
      await this.keepSelfAdmin(me, tx);
    });
  }

  /** Replaces the given modules of the role's matrix (modules not sent stay as they are). */
  async setRolePermissions(me: CurrentUser, key: string, matrix: Matrix) {
    const r = await this.role(key);
    if (key === ADMIN && !me.roles.includes(ADMIN)) throw new ForbiddenException("دور الـ Super Admin بيتعدّل من Super Admin بس");
    await this.db.$transaction(async (tx) => {
      for (const [module, actions] of Object.entries(matrix)) {
        const norm = normalizeActions(actions);
        await tx.rolePermission.upsert({ where: { roleId_module: { roleId: r.id, module } }, create: { roleId: r.id, module, actions: norm }, update: { actions: norm } });
      }
      await this.audit.record({ module: "access", entity: "Role", entityId: r.id, action: "permissions", userId: me.id, after: matrix }, tx);
      await this.keepSelfAdmin(me, tx);
    });
  }

  async deleteRole(me: CurrentUser, key: string) {
    const r = await this.role(key);
    if (r.builtIn) throw new BadRequestException("ده دور أساسي من الركوايرمنتس، مينفعش يتمسح");
    if (await this.db.userRole.count({ where: { roleId: r.id } })) throw new BadRequestException("فيه ناس على الدور ده · انقلهم لدور تاني الأول");
    await this.db.$transaction(async (tx) => {
      await tx.role.delete({ where: { id: r.id } });
      await this.audit.record({ module: "access", entity: "Role", entityId: r.id, action: "delete", userId: me.id, before: { key, label: r.label } }, tx);
    });
  }

  /* ---------------- audit log ---------------- */

  async auditLog(f: AuditFilters) {
    const [items, total] = await this.repo.audit(f);
    // BigInt ids don't serialise to JSON
    return { items: items.map((x) => ({ ...x, id: x.id.toString() })), total, page: f.page, pageSize: f.pageSize };
  }

  /* ---------------- helpers ---------------- */

  private async role(key: string) {
    const r = await this.db.role.findUnique({ where: { key } });
    if (!r) throw new NotFoundException();
    return r;
  }

  /** Primary first, no duplicates; the Super Admin role can only be added or removed by a Super Admin. */
  private roleKeys(me: CurrentUser, b: UserInput, had: string[]) {
    const keys = [...new Set([b.role, ...b.extraRoles])];
    if ((keys.includes(ADMIN) !== had.includes(ADMIN)) && !me.roles.includes(ADMIN)) throw new ForbiddenException("دور الـ Super Admin بيتدّى ويتشال من Super Admin بس");
    return keys;
  }

  private async checkRoles(keys: string[]) {
    const roles = new Map((await this.repo.rolesByKey(keys)).map((r) => [r.key, r]));
    const missing = keys.filter((k) => !roles.has(k));
    if (missing.length) throw new BadRequestException(`أدوار مش موجودة: ${missing.join(", ")}`);
    return roles;
  }

  private employeeData(b: UserInput, jobTitle: string) {
    return { name: b.name, department: b.department, jobTitle, teamLeaderId: b.teamLeaderId ?? null, managerId: b.teamLeaderId ?? null };
  }

  /** Runs inside the transaction: if the change would take «edit permissions» away from whoever made it, roll back. */
  private async keepSelfAdmin(me: CurrentUser, tx: Tx) {
    const after = await this.grants.currentUser(me.id, tx);
    if (!keepsAccessAdmin(after.grants)) throw new ForbiddenException("مينفعش تشيل من نفسك صلاحية تعديل الصلاحيات");
  }
}

const up = (s: string) => s.toUpperCase() as "OWN" | "TEAM" | "DEPT" | "ALL";
