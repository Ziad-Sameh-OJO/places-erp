import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { AuditFilters, Matrix, Overrides, RoleFieldsInput, RoleInput, RoleUpdate, UserFilters, UserInput, UserUpdate } from "@places/contracts";
import { AUDIT_ACTION_LABEL, MODULES, MODULE_LABEL, type ModuleKey } from "@places/domain";
import { ZodPipe } from "../../core/http/zod.pipe";
import { type ExcelColumn, sendXlsx } from "../../core/http/excel";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { AccessService } from "./access.service";

/** M-09 over HTTP: validate, check the permission, call the service. */
@Controller("access")
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get("users") @Requires("access", "view")
  users(@Me() me: CurrentUser, @Query(new ZodPipe(UserFilters)) f: UserFilters) { return this.access.listUsers(me, f); }

  // before users/:id, or "export" would be read as an id
  @Get("users/export") @Requires("access", "export")
  async exportUsers(@Me() me: CurrentUser, @Query(new ZodPipe(UserFilters)) f: UserFilters, @Res() res: Response) {
    const rows = await this.access.usersForExport(me, f);
    const STATUS = { ACTIVE: "شغال", INVITED: "مستني التفعيل", LOCKED: "مقفول", DISABLED: "متوقف" } as const;
    type Row = (typeof rows)[number];
    const hidden = me.fields.hidden("access"); // M-09 field permissions: a hidden field's column isn't in the file
    const cols: [string, ExcelColumn<Row>][] = [
      ["name", { header: "الاسم", value: (u) => u.employee?.name, width: 24 }],
      ["email", { header: "الإيميل", value: (u) => u.email, width: 30 }],
      ["phone", { header: "الموبايل", value: (u) => u.phone }],
      ["department", { header: "القسم", value: (u) => u.employee?.department }],
      ["roles", { header: "الأدوار", value: (u) => u.roles.map((r) => r.role.label).join(" + "), width: 30 }],
      ["status", { header: "الحالة", value: (u) => STATUS[u.status] }],
      ["otpRequired", { header: "OTP", value: (u) => (u.otpRequired ? "اه" : "لأ") }],
      ["lastLoginAt", { header: "آخر دخول", value: (u) => u.lastLoginAt, width: 20 }],
    ];
    await sendXlsx(res, "المستخدمين.xlsx", cols.filter(([k]) => !hidden.has(k)).map(([, c]) => c), rows, "المستخدمين");
  }

  /** The departments people are in, for the search filter (M-09 5.2). Before users/:id too. */
  @Get("users/departments") @Requires("access", "view")
  departments(@Me() me: CurrentUser) { return me.fields.hidden("access").has("department") ? [] : this.access.departments(); }

  @Get("users/:id") @Requires("access", "view")
  user(@Me() me: CurrentUser, @Param("id") id: string) { return this.access.userFor(me, id); }

  @Post("users") @Requires("access", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(UserInput)) b: UserInput) { return this.access.createUser(me, b); }

  @Put("users/:id") @Requires("access", "edit")
  update(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UserUpdate)) b: UserUpdate) { return this.access.updateUser(me, id, b); }

  // M-09 1.2 · 4.1: HR adds and stops accounts («access: create») without being able to touch permissions («edit»)
  @Post("users/:id/disable") @Requires("access", "create") @HttpCode(204)
  disable(@Me() me: CurrentUser, @Param("id") id: string) { return this.access.setActive(me, id, false); }

  @Post("users/:id/enable") @Requires("access", "edit") @HttpCode(204)
  enable(@Me() me: CurrentUser, @Param("id") id: string) { return this.access.setActive(me, id, true); }

  @Post("users/:id/unlock") @Requires("access", "edit") @HttpCode(204)
  unlock(@Me() me: CurrentUser, @Param("id") id: string) { return this.access.unlock(me, id); }

  @Post("users/:id/invite") @Requires("access", "edit") @HttpCode(204)
  invite(@Me() me: CurrentUser, @Param("id") id: string) { return this.access.resendInvite(me, id); }

  @Post("users/:id/reset") @Requires("access", "edit") @HttpCode(204)
  reset(@Me() me: CurrentUser, @Param("id") id: string) { return this.access.sendReset(me, id); }

  @Get("users/:id/permissions") @Requires("access", "view")
  permissions(@Me() me: CurrentUser, @Param("id") id: string) { return this.access.permissionsFor(me, id); }

  // «view» lets the call in; the service decides how far it reaches: «edit» → anyone, the Operations Head → his
  // team within his own permissions (M-09 2.2 · 4.1), anyone else → 403
  @Patch("users/:id/permissions") @Requires("access", "view")
  setOverrides(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(Overrides)) b: Overrides) { return this.access.setOverrides(me, id, b); }

  @Get("roles") @Requires("access", "view")
  roles() { return this.access.listRoles(); }

  // a new role is a new set of permissions: «edit», so HR's «create» (accounts) can't make one
  @Post("roles") @Requires("access", "edit")
  createRole(@Me() me: CurrentUser, @Body(new ZodPipe(RoleInput)) b: RoleInput) { return this.access.createRole(me, b); }

  @Patch("roles/:key") @Requires("access", "edit") @HttpCode(204)
  updateRole(@Me() me: CurrentUser, @Param("key") key: string, @Body(new ZodPipe(RoleUpdate)) b: RoleUpdate) { return this.access.updateRole(me, key, b); }

  @Patch("roles/:key/permissions") @Requires("access", "edit") @HttpCode(204)
  setRolePermissions(@Me() me: CurrentUser, @Param("key") key: string, @Body(new ZodPipe(Matrix)) b: Matrix) { return this.access.setRolePermissions(me, key, b); }

  /** M-09 field permissions: what each field of a module is for this role (shown, read only, hidden). */
  @Get("roles/:key/fields") @Requires("access", "view")
  roleFields(@Param("key") key: string) { return this.access.roleFields(key); }

  @Put("roles/:key/fields") @Requires("access", "edit") @HttpCode(204)
  setRoleFields(@Me() me: CurrentUser, @Param("key") key: string, @Body(new ZodPipe(RoleFieldsInput)) b: RoleFieldsInput) { return this.access.setRoleFields(me, key, b); }

  @Delete("roles/:key") @Requires("access", "delete") @HttpCode(204)
  deleteRole(@Me() me: CurrentUser, @Param("key") key: string) { return this.access.deleteRole(me, key); }

  @Get("audit") @Requires("access", "view")
  audit(@Query(new ZodPipe(AuditFilters)) f: AuditFilters) { return this.access.auditLog(f); }

  /** M-09 6.1: «Audit Log قابل للتصدير», with the same filters as the screen. */
  @Get("audit/export") @Requires("access", "export")
  async exportAudit(@Me() me: CurrentUser, @Query(new ZodPipe(AuditFilters)) f: AuditFilters, @Res() res: Response) {
    const rows = await this.access.auditForExport(me, f);
    const json = (v: unknown) => (v === null || v === undefined ? "" : JSON.stringify(v).slice(0, 32_000)); // an Excel cell holds 32,767 characters
    await sendXlsx(res, "Audit Log.xlsx", [
      { header: "الوقت", value: (x) => x.at, width: 20 },
      { header: "مين", value: (x) => x.who, width: 22 },
      { header: "الموديول", value: (x) => MODULE_LABEL[x.module as ModuleKey] ?? x.module, width: 18 },
      { header: "التغيير", value: (x) => `${AUDIT_ACTION_LABEL[x.action] ?? x.action} · ${x.entity}`, width: 26 },
      { header: "على", value: (x) => x.on, width: 22 },
      { header: "قبل", value: (x) => json(x.before), width: 40 },
      { header: "بعد", value: (x) => json(x.after), width: 40 },
      { header: "الجهاز", value: (x) => x.userAgent, width: 40 },
      { header: "IP", value: (x) => x.ip, width: 16 },
    ], rows, "Audit Log");
  }

  /** M-09 6.1: «تقرير مين عنده أنهي صلاحية»: one line per account, one column per module. */
  @Get("report/permissions") @Requires("access", "export")
  async permissionsReport(@Me() me: CurrentUser, @Res() res: Response) {
    const rows = await this.access.permissionsReport(me);
    const SCOPE = { own: "بتاعه بس", team: "فريقه", dept: "قسمه", all: "الكل" } as const;
    await sendXlsx(res, "مين عنده أنهي صلاحية.xlsx", [
      { header: "الاسم", value: (u) => u.name, width: 24 },
      { header: "الإيميل", value: (u) => u.email, width: 30 },
      { header: "القسم", value: (u) => u.department },
      { header: "الأدوار", value: (u) => u.roles, width: 30 },
      { header: "نطاق البيانات", value: (u) => SCOPE[u.scope] },
      { header: "استثناءات", value: (u) => u.overrides, width: 24 },
      ...MODULES.map((m) => ({ header: MODULE_LABEL[m], value: (u: (typeof rows)[number]) => u.modules[m], width: 22 })),
    ], rows, "الصلاحيات");
  }
}
