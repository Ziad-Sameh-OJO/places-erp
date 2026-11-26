import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { PrismaClient } from "@places/db";
import { InsuranceFilters, InsuranceInput, type InsuranceRow, type InsuranceSave } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";
import { ZodPipe } from "../../core/http/zod.pipe";
import { sendXlsx } from "../../core/http/excel";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { InsuranceService } from "./insurance.service";
import { blankHidden } from "../finance/hidden-fields";
import type { Tx } from "./hr.repository";

/** HTTP only. M-05 · «التأمينات» (HR, 15 Nov): HR's list and edits, and Finance's read-only view. */
@Controller()
export class InsuranceController {
  constructor(private readonly insurance: InsuranceService, @Inject(PRISMA) private readonly db: PrismaClient) {}

  private readonly run = <T>(fn: (tx: Tx) => Promise<T>) => this.db.$transaction(fn);

  @Get("hr/insurance")
  @Requires("hr", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(InsuranceFilters)) f: InsuranceFilters) {
    return this.insurance.list(me, f);
  }

  /** «تصدير» like the other HR lists, with the filter on the screen. */
  @Get("hr/insurance/export")
  @Requires("hr", "export")
  async export(@Me() me: CurrentUser, @Query(new ZodPipe(InsuranceFilters)) f: InsuranceFilters, @Res() res: Response) {
    const { items } = await this.insurance.list(me, f);
    await sendXlsx<InsuranceRow>(res, "التأمينات.xlsx", [ // ar-only: the Excel file name
      { header: "الموظف", value: (r) => r.name, width: 24 },
      { header: "القسم", value: (r) => r.department, width: 16 },
      { header: "متأمن عليه", value: (r) => (r.insured ? "أيوه" : "لأ") },
      { header: "من", value: (r) => r.since },
      { header: "الجهة", value: (r) => r.provider, width: 22 },
      { header: "الخصم الشهري", value: (r) => Number(r.monthly) },
      { header: "حصة الشركة", value: (r) => (r.companyShare === null ? "" : Number(r.companyShare)) },
      { header: "ملاحظة", value: (r) => r.note, width: 30 },
    ], items, "التأمينات");
  }

  @Put("hr/insurance/:userId")
  @Requires("hr", "edit")
  save(@Me() me: CurrentUser, @Param("userId") userId: string, @Body(new ZodPipe(InsuranceInput)) body: InsuranceSave) {
    return this.insurance.save(me, userId, body, this.run);
  }

  @Get("hr/insurance/:userId/files/:fileId")
  @Requires("hr", "view")
  file(@Me() me: CurrentUser, @Param("userId") userId: string, @Param("fileId") fileId: string) {
    return this.insurance.fileUrl(me, userId, fileId);
  }

  @Delete("hr/insurance/:userId/files/:fileId")
  @Requires("hr", "edit")
  @HttpCode(204)
  removeFile(@Me() me: CurrentUser, @Param("userId") userId: string, @Param("fileId") fileId: string) {
    return this.insurance.removeFile(me, userId, fileId, this.run);
  }

  @Get("finance/insurance")
  @Requires("finance", "view")
  async finance(@Me() me: CurrentUser) {
    // M-09: read under finance, so a hidden finance «المبلغ» blanks the monthly amounts too
    return blankHidden(await this.insurance.forFinance(), me.fields.hidden("finance"));
  }
}
