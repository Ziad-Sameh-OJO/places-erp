import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { PrismaClient } from "@places/db";
import { ExcuseAsk, NewOneOnOne, NewPenalty, OneQuestions, LeaveAsk, LeaveReject, MonthQuery, AttendanceDayQuery, AttendanceEntry, AttendanceExport, AttendanceRange, EmployeeFilters, EmployeePatch, FINGERPRINT_COLUMNS, FingerprintRow, LinkUnmatched } from "@places/contracts";
import { sendXlsx } from "../../core/http/excel";
import { IMPORT_MAX_BYTES, parseSheet, preview, type UploadedSheet } from "../../core/http/import";
import { AttendanceService } from "./attendance.service";
import { LeavesService } from "./leaves.service";
import { PeopleCareService } from "./people-care.service";
import { ExcusesService } from "./excuses.service";
import { PRISMA } from "../../core/database/database.module";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { HrService } from "./hr.service";
import type { Tx } from "./hr.repository";

const sheet = FileInterceptor("file", { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } });
const byPersonDay = (r: FingerprintRow) => `${r.name.trim()}|${r.day}`;

/** HTTP only: validate input, check the permission, call the service. M-05 · the employee file (7.1) and attendance (7.2 · 7.10 · 7.12). */
@Controller("hr")
export class HrController {
  constructor(private readonly hr: HrService, private readonly attendance: AttendanceService, private readonly leaves: LeavesService, private readonly care: PeopleCareService, private readonly excuses: ExcusesService, @Inject(PRISMA) private readonly db: PrismaClient) {}

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

  @Get("attendance/day")
  @Requires("hr", "view")
  attendanceDay(@Me() me: CurrentUser, @Query(new ZodPipe(AttendanceDayQuery)) q: { day?: string }) {
    return this.attendance.day(me, q.day);
  }

  /** «تصدير الحضور» (demo hr.js · M-12 0.11): the day on the screen, with the demo's columns. */
  @Get("attendance/export")
  @Requires("hr", "export")
  async exportAttendance(@Me() me: CurrentUser, @Query(new ZodPipe(AttendanceExport)) f: AttendanceExport, @Res() res: Response) {
    const { day, rows } = await this.attendance.exportDay(me, f);
    const DEDUCTION: Record<number, string> = { 1: "يوم", 0.5: "نص يوم", 0.25: "ربع يوم" };
    await sendXlsx(res, `الحضور ${day}.xlsx`, [
      { header: "اليوم", value: (a) => a.day },
      { header: "الموظف", value: (a) => a.name, width: 24 },
      { header: "القسم", value: (a) => a.department, width: 16 },
      { header: "Check-in", value: (a) => a.checkIn },
      { header: "Check-out", value: (a) => a.checkOut },
      { header: "Visit", value: (a) => a.visitAt },
      { header: "الحالة", value: (a) => a.label, width: 26 },
      { header: "دقايق", value: (a) => a.lateMinutes },
      { header: "الخصم", value: (a) => (a.deduction ? DEDUCTION[a.deduction] ?? a.deduction : a.confirmForgot ? "يوم · مستني Confirmation" : "") },
      // M-09 field permissions: a hidden amount isn't a column of zeros, it isn't there
      ...(me.fields.hidden("hr").has("deductionAmount") ? [] : [{ header: "مبلغ الخصم", value: (a: (typeof rows)[number]) => Number(a.deductionAmount) }]),
    ], rows, "الحضور");
  }

  @Get("attendance/history")
  @Requires("hr", "view")
  history(@Me() me: CurrentUser, @Query(new ZodPipe(AttendanceRange)) f: AttendanceRange) {
    return this.attendance.history(me, f);
  }

  @Get("attendance/weekly-delay")
  @Requires("hr", "view")
  weeklyDelay(@Me() me: CurrentUser, @Query(new ZodPipe(AttendanceRange)) f: AttendanceRange) {
    return this.attendance.weeklyDelay(me, f);
  }

  @Put("attendance")
  @Requires("hr", "edit")
  entry(@Me() me: CurrentUser, @Body(new ZodPipe(AttendanceEntry)) body: AttendanceEntry) {
    return this.attendance.entry(me, body, this.run);
  }

  /** «Confirm خصم يوم» on «نسي البصمة» (7.3). */
  @Post("attendance/:id/confirm-forgot")
  @HttpCode(200)
  @Requires("hr", "approve")
  confirmForgot(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.attendance.confirmForgot(me, id, this.run);
  }

  @Post("attendance/unmatched/:id/link")
  @Requires("hr", "edit")
  link(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(LinkUnmatched)) body: { employeeId: string }) {
    return this.attendance.link(me, id, body.employeeId, this.run);
  }

  @Get("attendance/import/template")
  @Requires("hr", "import")
  template(@Res() res: Response) {
    return sendXlsx(res, "قالب شيت البصمة.xlsx", Object.values(FINGERPRINT_COLUMNS).map((header) => ({ header, value: () => "", width: 20 })), []);
  }

  @Post("attendance/import/preview")
  @Requires("hr", "import") @UseInterceptors(sheet) @HttpCode(200)
  async previewSheet(@UploadedFile() file?: UploadedSheet) {
    return preview(await parseSheet(file, FINGERPRINT_COLUMNS, FingerprintRow, byPersonDay));
  }

  @Post("attendance/import")
  @Requires("hr", "import") @UseInterceptors(sheet) @HttpCode(200)
  async importSheet(@Me() me: CurrentUser, @UploadedFile() file?: UploadedSheet) {
    return this.attendance.importSheet(me, await parseSheet(file, FINGERPRINT_COLUMNS, FingerprintRow, byPersonDay), this.run);
  }

  /* ---- 7.5 · 7.6 · leaves ---- */
  @Get("leaves/mine")
  @SignedIn()
  myLeaves(@Me() me: CurrentUser) {
    return this.leaves.mine(me);
  }

  /** Anyone with a file asks for leave (personal: @SignedIn). */
  @Post("leaves")
  @SignedIn()
  ask(@Me() me: CurrentUser, @Body(new ZodPipe(LeaveAsk)) body: LeaveAsk) {
    return this.leaves.ask(me, body, this.run);
  }

  @Get("leaves")
  @Requires("hr", "view")
  leaveList(@Me() me: CurrentUser) {
    return this.leaves.list(me);
  }

  @Post("leaves/:id/approve")
  @Requires("hr", "approve")
  approve(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.leaves.approve(me, id, this.run);
  }

  @Post("leaves/:id/reject")
  @Requires("hr", "approve")
  reject(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(LeaveReject)) body: { reason: string }) {
    return this.leaves.reject(me, id, body.reason, this.run);
  }

  @Get("leaves/calendar")
  @Requires("hr", "view")
  calendar(@Me() me: CurrentUser, @Query(new ZodPipe(MonthQuery)) q: { month?: string }) {
    return this.leaves.calendar(me, q.month);
  }

  @Get("leaves/balances/export")
  @Requires("hr", "export")
  async exportBalances(@Me() me: CurrentUser, @Query(new ZodPipe(MonthQuery)) q: { month?: string }, @Res() res: Response) {
    const r = await this.leaves.balancesReport(me, q.month);
    await sendXlsx(res, `أرصدة الإجازات ${r.month}.xlsx`, [
      { header: "الموظف", value: (x: (typeof r.rows)[number]) => x.name, width: 24 }, { header: "القسم", value: (x) => x.department },
      ...r.types.flatMap((t) => [{ header: `${t} · الرصيد`, value: (x: (typeof r.rows)[number]) => x.byType[t]?.total }, { header: `${t} · الشهر ده`, value: (x: (typeof r.rows)[number]) => x.byType[t]?.month }, { header: `${t} · الباقي`, value: (x: (typeof r.rows)[number]) => x.byType[t]?.left }]),
    ], r.rows, "الأرصدة");
  }

  @Get("leaves/balances")
  @Requires("hr", "view")
  balances(@Me() me: CurrentUser, @Query(new ZodPipe(MonthQuery)) q: { month?: string }) {
    return this.leaves.balancesReport(me, q.month);
  }

  /* ---- 7.9 · the month's deductions, approved by HR for payroll ---- */
  @Get("deductions")
  @Requires("hr", "view")
  deductions(@Me() me: CurrentUser, @Query(new ZodPipe(MonthQuery)) q: { month?: string }) {
    return this.attendance.deductions(me, q.month);
  }

  /* ---- 7.11 · the ideal employee and the team fund ---- */
  @Get("ideal")
  @Requires("hr", "view")
  ideal(@Me() me: CurrentUser, @Query(new ZodPipe(MonthQuery)) q: { month?: string }) {
    return this.attendance.ideal(me, q.month);
  }

  /** HR only (hr: edit + approve, scope all): the Super Admin and a Team Leader can't. */
  @Post("deductions/approve")
  @Requires("hr", "edit")
  approveDeductions(@Me() me: CurrentUser) {
    return this.attendance.approveDeductions(me, this.run);
  }

  /* ---- 7.7 · penalties ---- */
  @Get("penalties")
  @Requires("hr", "view")
  penalties(@Me() me: CurrentUser, @Query(new ZodPipe(MonthQuery)) q: { month?: string }) {
    return this.care.penalties(me, q.month);
  }

  /** HR records (approved at once); a TL proposes for his team (hr: approve) and it waits for HR. */
  @Post("penalties")
  @Requires("hr", "approve")
  addPenalty(@Me() me: CurrentUser, @Body(new ZodPipe(NewPenalty)) body: NewPenalty) {
    return this.care.addPenalty(me, body, this.run);
  }

  @Post("penalties/:id/approve")
  @Requires("hr", "edit")
  approvePenalty(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.care.decidePenalty(me, id, true, this.run);
  }

  @Post("penalties/:id/reject")
  @Requires("hr", "edit")
  rejectPenalty(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.care.decidePenalty(me, id, false, this.run);
  }

  @Delete("penalties/:id")
  @Requires("hr", "delete")
  removePenalty(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.care.removePenalty(me, id, this.run);
  }

  /* ---- 7.8 · the 1-to-1 ---- */
  @Get("one-on-one/questions")
  @Requires("hr", "view")
  questions() {
    return this.care.questions();
  }

  @Put("one-on-one/questions")
  @Requires("hr", "edit")
  setQuestions(@Me() me: CurrentUser, @Body(new ZodPipe(OneQuestions)) body: { questions: string[] }) {
    return this.care.setQuestions(me, body.questions, this.run);
  }

  @Get("one-on-one/actions")
  @Requires("hr", "edit")
  actions() {
    return this.care.actions();
  }

  @Post("one-on-one/:id/done")
  @Requires("hr", "edit")
  actionDone(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.care.actionDone(me, id, this.run);
  }

  @Get("employees/:id/one-on-one")
  @Requires("hr", "view")
  oneOnOnes(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.care.oneOnOnes(me, id);
  }

  @Post("employees/:id/one-on-one")
  @Requires("hr", "edit")
  addOneOnOne(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(NewOneOnOne)) body: NewOneOnOne) {
    return this.care.addOneOnOne(me, id, body, this.run);
  }

  /* ---- 7.4 · the Excuse ---- */
  @Get("excuses/mine")
  @SignedIn()
  myExcuses(@Me() me: CurrentUser) {
    return this.excuses.mine(me);
  }

  @Post("excuses")
  @SignedIn()
  askExcuse(@Me() me: CurrentUser, @Body(new ZodPipe(ExcuseAsk)) body: ExcuseAsk) {
    return this.excuses.ask(me, body, this.run);
  }

  @Get("excuses")
  @Requires("hr", "view")
  excuseList(@Me() me: CurrentUser) {
    return this.excuses.list(me);
  }

  @Post("excuses/:id/approve")
  @Requires("hr", "approve")
  approveExcuse(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.excuses.approve(me, id, this.run);
  }

  @Post("excuses/:id/reject")
  @Requires("hr", "approve")
  rejectExcuse(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(LeaveReject)) body: { reason: string }) {
    return this.excuses.reject(me, id, body.reason, this.run);
  }
}
