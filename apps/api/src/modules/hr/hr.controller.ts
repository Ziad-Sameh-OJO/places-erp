import { Body, Controller, Get, Inject, Param, Patch, Query } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { EmployeeFilters, EmployeePatch } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { HrService } from "./hr.service";
import type { Tx } from "./hr.repository";

/** HTTP only: validate input, check the permission, call the service. M-05 · the employee file (7.1). */
@Controller("hr")
export class HrController {
  constructor(private readonly hr: HrService, @Inject(PRISMA) private readonly db: PrismaClient) {}

  private readonly run = <T>(fn: (tx: Tx) => Promise<T>) => this.db.$transaction(fn);

  @Get("employees")
  @Requires("hr", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(EmployeeFilters)) f: EmployeeFilters) {
    return this.hr.list(me, f);
  }

  @Get("employees/:id")
  @Requires("hr", "view")
  file(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.hr.file(me, id);
  }

  /** HR only (hr: edit). The Super Admin views but doesn't edit HR data (Q49). */
  @Patch("employees/:id")
  @Requires("hr", "edit")
  update(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(EmployeePatch)) body: EmployeePatch) {
    return this.hr.update(me, id, body, this.run);
  }
}
