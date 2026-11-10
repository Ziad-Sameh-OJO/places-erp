import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { DailyFieldInput, DailyInput, DayQuery, HandInInput, ReportsAccessInput, TargetMonthQuery, ReportInput, TargetInput, TransactionsQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { sendXlsx } from "../../core/http/excel";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ReportsService } from "./reports.service";
import { TargetsService } from "./targets.service";

/**
 * HTTP only (M-12 · 11.8 · 11.10 · 11.12). The schedules and the targets need their «reports» grant; handing in and the
 * daily report are @SignedIn: the service checks the report names you, and who you follow.
 */
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly targets: TargetsService) {}

  /** 11.20 · «مين يشوف التقارير»: the heads only (the service checks the role, not the «reports» grant it gates). */
  @Get("access")
  @SignedIn()
  access(@Me() me: CurrentUser) {
    return this.reports.access(me);
  }

  @Put("access/:userId")
  @HttpCode(204)
  @SignedIn()
  setAccess(@Me() me: CurrentUser, @Param("userId") userId: string, @Body(new ZodPipe(ReportsAccessInput)) body: ReportsAccessInput) {
    return this.reports.setAccess(me, userId, body.on);
  }

  @Get("scheduled")
  @Requires("reports", "view")
  list(@Me() me: CurrentUser) {
    return this.reports.list(me);
  }

  @Post("scheduled")
  @Requires("reports", "edit")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(ReportInput)) body: ReportInput) {
    return this.reports.save(me, null, body);
  }

  @Put("scheduled/:id")
  @Requires("reports", "edit")
  update(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ReportInput)) body: ReportInput) {
    return this.reports.save(me, id, body);
  }

  @Delete("scheduled/:id")
  @HttpCode(204)
  @Requires("reports", "edit")
  remove(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.reports.remove(me, id);
  }

  @Post("scheduled/:id/run")
  @Requires("reports", "view")
  runNow(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.reports.runNow(me, id);
  }

  @Get("runs/:id/file")
  @Requires("reports", "view")
  async runFile(@Me() me: CurrentUser, @Param("id") id: string, @Res() res: Response) {
    const r = await this.reports.run(me, id);
    const heads = Object.keys(r.rows[0] ?? {});
    await sendXlsx(res, `${r.title}.xlsx`, heads.map((h) => ({ header: h, value: (row: Record<string, string | number>) => row[h] })), r.rows);
  }

  @Get("mine")
  @SignedIn()
  mine(@Me() me: CurrentUser) {
    return this.reports.mine(me);
  }

  @Post("scheduled/:id/hand-in")
  @SignedIn()
  handIn(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(HandInInput)) body: HandInInput) {
    return this.reports.handIn(me, id, body.note);
  }

  @Get("daily/me")
  @SignedIn()
  myDaily(@Me() me: CurrentUser) {
    return this.reports.myForm(me);
  }

  @Post("daily")
  @SignedIn()
  submitDaily(@Me() me: CurrentUser, @Body(new ZodPipe(DailyInput)) body: DailyInput) {
    return this.reports.submitDaily(me, body);
  }

  @Get("daily/day")
  @SignedIn()
  day(@Me() me: CurrentUser, @Query(new ZodPipe(DayQuery)) q: DayQuery) {
    return this.reports.day(me, q.userId, q.day);
  }

  @Post("daily/fields")
  @SignedIn()
  addField(@Me() me: CurrentUser, @Body(new ZodPipe(DailyFieldInput)) body: DailyFieldInput) {
    return this.reports.addField(me, body);
  }

  @Delete("daily/fields/:id")
  @HttpCode(204)
  @SignedIn()
  removeField(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.reports.removeField(me, id);
  }

  @Post("daily/fields/copy/:userId")
  @SignedIn()
  copyFields(@Me() me: CurrentUser, @Param("userId") userId: string) {
    return this.reports.copyFields(me, userId);
  }

  @Get("targets")
  @Requires("reports", "view")
  targetsView(@Me() me: CurrentUser, @Query(new ZodPipe(TargetMonthQuery)) q: TargetMonthQuery) {
    return this.targets.view(me, q.month);
  }

  @Put("targets")
  @Requires("reports", "edit")
  setTarget(@Me() me: CurrentUser, @Body(new ZodPipe(TargetInput)) body: TargetInput) {
    return this.targets.setTarget(me, body);
  }

  @Post("targets/:employeeId/:month/approve")
  @HttpCode(204)
  @Requires("reports", "approve")
  approve(@Me() me: CurrentUser, @Param("employeeId") employeeId: string, @Param("month") month: string) {
    return this.targets.approve(me, employeeId, month);
  }

  @Get("transactions")
  @Requires("reports", "view")
  transactions(@Me() me: CurrentUser, @Query(new ZodPipe(TransactionsQuery)) q: TransactionsQuery) {
    return this.targets.transactions(me, q.from, q.to);
  }
}
