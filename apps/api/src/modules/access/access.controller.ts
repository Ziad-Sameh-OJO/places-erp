import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { AuditFilters, Matrix, Overrides, RoleInput, RoleUpdate, UserFilters, UserInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { sendXlsx } from "../../core/http/excel";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { AccessService } from "./access.service";

/** M-09 over HTTP: validate, check the permission, call the service. */
@Controller("access")
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get("users") @Requires("access", "view")
  users(@Query(new ZodPipe(UserFilters)) f: UserFilters) { return this.access.listUsers(f); }

  // before users/:id, or "export" would be read as an id
  @Get("users/export") @Requires("access", "export")
  async exportUsers(@Me() me: CurrentUser, @Query(new ZodPipe(UserFilters)) f: UserFilters, @Res() res: Response) {
    const rows = await this.access.usersForExport(me, f);
    const STATUS = { ACTIVE: "شغال", INVITED: "مستني التفعيل", LOCKED: "مقفول", DISABLED: "متوقف" } as const;
    await sendXlsx(res, "المستخدمين.xlsx", [
      { header: "الاسم", value: (u) => u.employee?.name, width: 24 },
      { header: "الإيميل", value: (u) => u.email, width: 30 },
      { header: "الموبايل", value: (u) => u.phone },
      { header: "القسم", value: (u) => u.employee?.department },
      { header: "الأدوار", value: (u) => u.roles.map((r) => r.role.label).join(" + "), width: 30 },
      { header: "الحالة", value: (u) => STATUS[u.status] },
      { header: "OTP", value: (u) => (u.otpRequired ? "اه" : "لأ") },
      { header: "آخر دخول", value: (u) => u.lastLoginAt, width: 20 },
    ], rows, "المستخدمين");
  }

  /** The departments people are in, for the search filter (M-09 5.2). Before users/:id too. */
  @Get("users/departments") @Requires("access", "view")
  departments() { return this.access.departments(); }

  @Get("users/:id") @Requires("access", "view")
  user(@Param("id") id: string) { return this.access.getUser(id); }

  @Post("users") @Requires("access", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(UserInput)) b: UserInput) { return this.access.createUser(me, b); }

  @Put("users/:id") @Requires("access", "edit")
  update(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UserInput)) b: UserInput) { return this.access.updateUser(me, id, b); }

  @Post("users/:id/disable") @Requires("access", "edit") @HttpCode(204)
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
  permissions(@Param("id") id: string) { return this.access.permissionsOf(id); }

  @Patch("users/:id/permissions") @Requires("access", "edit")
  setOverrides(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(Overrides)) b: Overrides) { return this.access.setOverrides(me, id, b); }

  @Get("roles") @Requires("access", "view")
  roles() { return this.access.listRoles(); }

  @Post("roles") @Requires("access", "create")
  createRole(@Me() me: CurrentUser, @Body(new ZodPipe(RoleInput)) b: RoleInput) { return this.access.createRole(me, b); }

  @Patch("roles/:key") @Requires("access", "edit") @HttpCode(204)
  updateRole(@Me() me: CurrentUser, @Param("key") key: string, @Body(new ZodPipe(RoleUpdate)) b: RoleUpdate) { return this.access.updateRole(me, key, b); }

  @Patch("roles/:key/permissions") @Requires("access", "edit") @HttpCode(204)
  setRolePermissions(@Me() me: CurrentUser, @Param("key") key: string, @Body(new ZodPipe(Matrix)) b: Matrix) { return this.access.setRolePermissions(me, key, b); }

  @Delete("roles/:key") @Requires("access", "delete") @HttpCode(204)
  deleteRole(@Me() me: CurrentUser, @Param("key") key: string) { return this.access.deleteRole(me, key); }

  @Get("audit") @Requires("access", "view")
  audit(@Query(new ZodPipe(AuditFilters)) f: AuditFilters) { return this.access.auditLog(f); }
}
