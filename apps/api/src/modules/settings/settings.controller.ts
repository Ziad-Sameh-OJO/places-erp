import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { DocTemplateInput, EntityPatch, HolidayInput, HolidayRow, Id, SettingKeyParam, StampInput, type SettingKey } from "@places/contracts";
import { DOC_KINDS, type DocKind } from "@places/domain";
import { z } from "zod";
import { DocumentsService, sendPdf } from "../../core/documents/documents.service";
import { DocumentsSetupService } from "./documents-setup.service";
import { ZodPipe } from "../../core/http/zod.pipe";
import { sendXlsx } from "../../core/http/excel";
import { IMPORT_MAX_BYTES, parseSheet, preview, type UploadedSheet } from "../../core/http/import";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "./settings.service";

/** «لحد» empty = a one-day holiday (1.29: holidays are ranges). */
const HOLIDAY_COLUMNS = { from: "من", to: "لحد", label: "الإجازة" };
const DocKindParam = z.enum(DOC_KINDS);
const sheet = FileInterceptor("file", { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } });

/** Everybody reads the lists (every form needs them); «master: edit» changes them, or per list whom the admin picks (#186). */
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService, private readonly docs: DocumentsSetupService, private readonly pdf: DocumentsService) {}

  @Get() @SignedIn()
  all() { return this.settings.all(); }

  @Get("stages") @SignedIn()
  stages() { return this.settings.stages(); }

  @Get("holidays") @SignedIn()
  holidays() { return this.settings.holidays(); }

  @Post("holidays") @Requires("master", "edit")
  addHoliday(@Me() me: CurrentUser, @Body(new ZodPipe(HolidayInput)) b: HolidayInput) { return this.settings.addHoliday(me, b); }

  /** The empty sheet with the right headers, so people fill the template instead of guessing column names. */
  @Get("holidays/import/template") @Requires("master", "edit")
  holidaysTemplate(@Res() res: Response) {
    return sendXlsx(res, "قالب الإجازات الرسمية.xlsx", Object.values(HOLIDAY_COLUMNS).map((header) => ({ header, value: () => "", width: 24 })), []);
  }

  /** Step 1: the sheet's rows and errors, nothing saved. */
  @Post("holidays/import/preview") @Requires("master", "edit") @UseInterceptors(sheet) @HttpCode(200)
  async previewHolidays(@UploadedFile() file?: UploadedSheet) {
    return preview(await parseSheet(file, HOLIDAY_COLUMNS, HolidayRow, (r) => `${r.from}|${r.to}`));
  }

  /** Step 2 («تأكيد»): the same file again, saved only if it has no errors. */
  @Post("holidays/import") @Requires("master", "edit") @UseInterceptors(sheet) @HttpCode(200)
  async importHolidays(@Me() me: CurrentUser, @UploadedFile() file?: UploadedSheet) {
    return this.settings.importHolidays(me, await parseSheet(file, HOLIDAY_COLUMNS, HolidayRow, (r) => `${r.from}|${r.to}`));
  }

  @Delete("holidays/:id") @Requires("master", "edit") @HttpCode(204)
  removeHoliday(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string) { return this.settings.removeHoliday(me, id); }

  @Get("list-editors/options") @Requires("access", "edit")
  listEditorOptions() { return this.settings.listEditorOptions(); }

  /* ---- 12.12 · the stamp and signature, the entities, the document templates ---- */

  @Get("documents") @Requires("master", "view")
  documents() { return this.docs.setup(); }

  /** «master: edit» reaches it; the service lets only the Super Admin through. Declared before `:key`, which would catch it. */
  @Put("stamp") @Requires("master", "edit") @HttpCode(204)
  stamp(@Me() me: CurrentUser, @Body(new ZodPipe(StampInput)) b: StampInput) { return this.docs.setStamp(me, b); }

  @Put("entities/:id") @Requires("master", "edit") @HttpCode(204)
  entity(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Body(new ZodPipe(EntityPatch)) b: EntityPatch) { return this.docs.setEntity(me, id, b); }

  @Put("templates/:kind") @Requires("master", "edit") @HttpCode(204)
  template(@Me() me: CurrentUser, @Param("kind", new ZodPipe(DocKindParam)) kind: DocKind, @Body(new ZodPipe(DocTemplateInput)) b: DocTemplateInput) { return this.docs.setTemplate(me, kind, b); }

  /** «رجّع الافتراضي» */
  @Delete("templates/:kind") @Requires("master", "edit") @HttpCode(204)
  resetTemplate(@Me() me: CurrentUser, @Param("kind", new ZodPipe(DocKindParam)) kind: DocKind) { return this.docs.setTemplate(me, kind, null); }

  /** «شوف شكلها»: the saved template on a made-up claim, with the stamp, as the PDF. */
  @Get("templates/:kind/preview") @Requires("master", "view")
  async preview(@Param("kind", new ZodPipe(DocKindParam)) kind: DocKind, @Res() res: Response) {
    const today = new Date().toISOString().slice(0, 10);
    const { title, html } = await this.docs.render(kind, { no: kind === "claim" ? "CL-000" : "RC-000", claimNo: "CL-000", date: today, entityId: "places", company: "شركة النيل للتكنولوجيا",
      unit: "U-101", unitInfo: "Mivida Business Park · مبنى B4 · الدور 2 · 95 م² · متشطب", amount: "100000.00", kind: "عمولة تأجير", einvoiceNo: "EG-2026-000000",
      contractNo: "C-000", installment: "القسط 1 من 12" });
    sendPdf(res, `${title} · معاينة.pdf`, await this.pdf.pdf(html));
  }

  /** Who may save depends on the key and, for a list, on its own editors (#186): SettingsService.change decides, denying by default. */
  @Put(":key") @SignedIn()
  set(@Me() me: CurrentUser, @Param("key", new ZodPipe(SettingKeyParam)) key: SettingKey, @Body() body: { value: unknown }) {
    return this.settings.change(me, key, body?.value);
  }
}
