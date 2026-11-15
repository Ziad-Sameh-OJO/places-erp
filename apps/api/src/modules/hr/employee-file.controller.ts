import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { PrismaClient } from "@places/db";
import { EmployeeDocTypes, MonthQuery, NewEmployeeDocument, OneOnOneRange } from "@places/contracts";
import { sendXlsx } from "../../core/http/excel";
import { PRISMA } from "../../core/database/database.module";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { EmployeeFileService } from "./employee-file.service";
import type { Tx } from "./hr.repository";

/** HTTP only. M-05 · the employee file (HR, 15 Nov) and the 1-to-1 coverage and report; HR and the admins only (service). */
@Controller("hr")
export class EmployeeFileController {
  constructor(private readonly file: EmployeeFileService, @Inject(PRISMA) private readonly db: PrismaClient) {}

  private readonly run = <T>(fn: (tx: Tx) => Promise<T>) => this.db.$transaction(fn);

  @Get("employee-docs/types")
  @Requires("hr", "view")
  types() {
    return this.file.docTypes();
  }

  @Put("employee-docs/types")
  @Requires("hr", "edit")
  setTypes(@Me() me: CurrentUser, @Body(new ZodPipe(EmployeeDocTypes)) b: { types: string[] }) {
    return this.file.setDocTypes(me, b.types, this.run);
  }

  @Get("employee-docs/missing")
  @Requires("hr", "view")
  missing(@Me() me: CurrentUser) {
    return this.file.missingCounts(me);
  }

  @Get("employees/:id/documents")
  @Requires("hr", "view")
  documents(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.file.file(me, id);
  }

  @Post("employees/:id/documents")
  @Requires("hr", "edit")
  upload(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(NewEmployeeDocument)) b: NewEmployeeDocument) {
    return this.file.upload(me, id, b, this.run);
  }

  @Get("employee-docs/:id/url")
  @Requires("hr", "view")
  url(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.file.downloadUrl(me, id);
  }

  @Delete("employee-docs/:id")
  @Requires("hr", "delete")
  remove(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.file.remove(me, id, this.run);
  }

  @Get("one-on-one/coverage")
  @Requires("hr", "view")
  coverage(@Me() me: CurrentUser, @Query(new ZodPipe(MonthQuery)) q: { month?: string }) {
    return this.file.coverage(me, q.month);
  }

  @Get("one-on-one/report")
  @Requires("hr", "view")
  report(@Me() me: CurrentUser, @Query(new ZodPipe(OneOnOneRange)) r: OneOnOneRange) {
    return this.file.report(me, r);
  }

  /** 0.11: the report as Excel, the columns on the screen. */
  @Get("one-on-one/report/export")
  @Requires("hr", "export")
  async exportReport(@Me() me: CurrentUser, @Query(new ZodPipe(OneOnOneRange)) r: OneOnOneRange, @Res() res: Response) {
    const rows = await this.file.report(me, r);
    await sendXlsx(res, `تقرير الـ 1-to-1 ${r.from} - ${r.to}.xlsx`, [
      { header: "الموظف", value: (x) => x.name, width: 24 },
      { header: "التاريخ", value: (x) => x.heldOn },
      { header: "اللي عمله", value: (x) => x.by, width: 20 },
      { header: "ملخص الإجابات", value: (x) => x.summary, width: 60 },
      { header: "حل الـ HR", value: (x) => x.hrAction ?? "", width: 30 },
      { header: "ميعاده", value: (x) => x.hrActionDue ?? "" },
      { header: "اتعمل؟", value: (x) => (x.hrAction ? (x.hrActionDone ? "اتعمل" : "لسه") : "") },
    ], rows);
  }
}
