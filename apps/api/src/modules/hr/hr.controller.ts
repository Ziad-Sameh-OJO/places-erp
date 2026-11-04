import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { PrismaClient } from "@places/db";
import { AttendanceDayQuery, AttendanceEntry, AttendanceRange, EmployeeFilters, EmployeePatch, FINGERPRINT_COLUMNS, FingerprintRow, LinkUnmatched } from "@places/contracts";
import { sendXlsx } from "../../core/http/excel";
import { IMPORT_MAX_BYTES, parseSheet, preview, type UploadedSheet } from "../../core/http/import";
import { AttendanceService } from "./attendance.service";
import { PRISMA } from "../../core/database/database.module";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { HrService } from "./hr.service";
import type { Tx } from "./hr.repository";

const sheet = FileInterceptor("file", { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } });
const byPersonDay = (r: FingerprintRow) => `${r.name.trim()}|${r.day}`;

/** HTTP only: validate input, check the permission, call the service. M-05 · the employee file (7.1) and attendance (7.2 · 7.10 · 7.12). */
@Controller("hr")
export class HrController {
  constructor(private readonly hr: HrService, private readonly attendance: AttendanceService, @Inject(PRISMA) private readonly db: PrismaClient) {}

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
}
