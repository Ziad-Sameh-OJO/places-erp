import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { z } from "zod";
import { HolidayInput, HolidayRow, SettingKeyParam, type SettingKey } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { sendXlsx } from "../../core/http/excel";
import { IMPORT_MAX_BYTES, parseSheet, preview, type UploadedSheet } from "../../core/http/import";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "./settings.service";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const HOLIDAY_COLUMNS = { day: "التاريخ", label: "الإجازة" };
const sheet = FileInterceptor("file", { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } });

/** Everybody reads the lists (every form needs them); only «master: edit» changes them. */
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get() @SignedIn()
  all() { return this.settings.all(); }

  @Get("stages") @SignedIn()
  stages() { return this.settings.stages(); }

  @Get("holidays") @SignedIn()
  holidays() { return this.settings.holidays(); }

  @Post("holidays") @Requires("master", "edit") @HttpCode(204)
  addHoliday(@Me() me: CurrentUser, @Body(new ZodPipe(HolidayInput)) b: HolidayInput) { return this.settings.addHoliday(me, b); }

  /** The empty sheet with the right headers, so people fill the template instead of guessing column names. */
  @Get("holidays/import/template") @Requires("master", "edit")
  holidaysTemplate(@Res() res: Response) {
    return sendXlsx(res, "قالب الإجازات الرسمية.xlsx", Object.values(HOLIDAY_COLUMNS).map((header) => ({ header, value: () => "", width: 24 })), []);
  }

  /** Step 1: the sheet's rows and errors, nothing saved. */
  @Post("holidays/import/preview") @Requires("master", "edit") @UseInterceptors(sheet) @HttpCode(200)
  async previewHolidays(@UploadedFile() file?: UploadedSheet) {
    return preview(await parseSheet(file, HOLIDAY_COLUMNS, HolidayRow, (r) => r.day));
  }

  /** Step 2 («تأكيد»): the same file again, saved only if it has no errors. */
  @Post("holidays/import") @Requires("master", "edit") @UseInterceptors(sheet) @HttpCode(200)
  async importHolidays(@Me() me: CurrentUser, @UploadedFile() file?: UploadedSheet) {
    return this.settings.importHolidays(me, await parseSheet(file, HOLIDAY_COLUMNS, HolidayRow, (r) => r.day));
  }

  @Delete("holidays/:day") @Requires("master", "edit") @HttpCode(204)
  removeHoliday(@Me() me: CurrentUser, @Param("day", new ZodPipe(Day)) day: string) { return this.settings.removeHoliday(me, day); }

  @Put(":key") @Requires("master", "edit")
  set(@Me() me: CurrentUser, @Param("key", new ZodPipe(SettingKeyParam)) key: SettingKey, @Body() body: { value: unknown }) {
    return this.settings.set(me, key, body?.value);
  }
}
