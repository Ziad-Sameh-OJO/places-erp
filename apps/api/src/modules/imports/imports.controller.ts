import { Controller, Get, HttpCode, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { CompanyImportRow, LeadImportRow, UnitImportRow, type ImportDone, type ImportPreview } from "@places/contracts";
import { sendXlsx } from "../../core/http/excel";
import { IMPORT_MAX_BYTES, parseBook, parseSheet, type ImportColumns, type ImportReport, type ParsedSheet, type UploadedSheet } from "../../core/http/import";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryService } from "../inventory/inventory.service";
import { LeadImportService } from "../leads/import.service";

/** The fixed templates (13.1): headers as the unit form and the lead form show them. */
const UNIT_COLUMNS = {
  type: "Type", project: "Project", area: "Area", space: "المساحة", condition: "التشطيب", floor: "الدور", building: "رقم المبنى", parking: "Parking",
  ownerName: "الاسم", ownerPhone: "الرقم", pricePerSqm: "السعر للمتر", leasePerSqm: "سعر الإيجار للمتر (Income)", agentId: "الـ Agent",
  maintenance: "الصيانة", commission: "الـ Commission", paymentMethod: "طريقة الدفع", lastOwnerUpdateAt: "Last update",
};
const LEAD_COLUMNS = {
  name: "الاسم", phones: "الموبايل", company: "الشركة", area: "Area", type: "Type", space: "المساحة", budget: "البادجت", channel: "Channel",
  arrivedAt: "التاريخ", note: "ملاحظة",
};
const COMPANY_COLUMNS = {
  name: "اسم الشركة", category: "الكاتيجوري", number: "الرقم", contactName: "اسم المسؤول", contactTitle: "الوظيفة", email: "الإيميل",
  currentLocation: "المكان الحالي", currentSpace: "المساحة الحالية", contractStart: "بداية العقد", contractEnd: "نهاية العقد",
  averageRent: "متوسط الإيجار", annualEscalation: "الزيادة السنوية %", feedback: "الفيدباك",
};
/** The client's archive is one tab per category (1.21): a tab without «الكاتيجوري» takes its name from the tab. */
const companiesBook = (file: UploadedSheet | undefined) => parseBook(file, COMPANY_COLUMNS, "category", CompanyImportRow);
const sheet = FileInterceptor("file", { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } });

const template = (res: Response, name: string, columns: ImportColumns<string>) =>
  sendXlsx(res, name, Object.values(columns).map((header) => ({ header, value: () => "", width: 20 })), []);
const previewOf = <T>(p: ParsedSheet<T>, r: ImportReport): ImportPreview<T> =>
  ({ total: p.total, valid: r.added, duplicates: r.duplicates, errors: r.errors, sample: p.rows.slice(0, 50).map((x) => x.data) });
const doneOf = (r: ImportReport): ImportDone => ({ imported: r.added, duplicates: r.duplicates, skipped: r.errors.length });

/**
 * 13.1 · the old data (units, companies, leads) from fixed templates: template → preview (added / duplicate / errors,
 * nothing saved) → «تأكيد» saves the new rows. Duplicates and rows with errors are skipped and counted (the report).
 */
@Controller("imports")
export class ImportsController {
  constructor(private readonly inventory: InventoryService, private readonly leads: LeadImportService) {}

  @Get("units/template") @Requires("inventory", "import")
  unitsTemplate(@Res() res: Response) { return template(res, "قالب الوحدات.xlsx", UNIT_COLUMNS); }

  @Post("units/preview") @Requires("inventory", "import") @UseInterceptors(sheet) @HttpCode(200)
  async previewUnits(@Me() me: CurrentUser, @UploadedFile() file?: UploadedSheet) {
    const p = await parseSheet(file, UNIT_COLUMNS, UnitImportRow);
    return previewOf(p, await this.inventory.importUnits(me, p, false));
  }

  @Post("units") @Requires("inventory", "import") @UseInterceptors(sheet) @HttpCode(200)
  async importUnits(@Me() me: CurrentUser, @UploadedFile() file?: UploadedSheet) {
    return doneOf(await this.inventory.importUnits(me, await parseSheet(file, UNIT_COLUMNS, UnitImportRow), true));
  }

  @Get("leads/template") @Requires("leads", "import")
  leadsTemplate(@Res() res: Response) { return template(res, "قالب الليدز القديمة.xlsx", LEAD_COLUMNS); }

  @Post("leads/preview") @Requires("leads", "import") @UseInterceptors(sheet) @HttpCode(200)
  async previewLeads(@Me() me: CurrentUser, @UploadedFile() file?: UploadedSheet) {
    const p = await parseSheet(file, LEAD_COLUMNS, LeadImportRow);
    return previewOf(p, await this.leads.leads(me, p, false));
  }

  @Post("leads") @Requires("leads", "import") @UseInterceptors(sheet) @HttpCode(200)
  async importLeads(@Me() me: CurrentUser, @UploadedFile() file?: UploadedSheet) {
    return doneOf(await this.leads.leads(me, await parseSheet(file, LEAD_COLUMNS, LeadImportRow), true));
  }

  @Get("companies/template") @Requires("leads", "import")
  companiesTemplate(@Res() res: Response) { return template(res, "قالب الشركات.xlsx", COMPANY_COLUMNS); }

  @Post("companies/preview") @Requires("leads", "import") @UseInterceptors(sheet) @HttpCode(200)
  async previewCompanies(@Me() me: CurrentUser, @UploadedFile() file?: UploadedSheet) {
    const p = await companiesBook(file);
    return previewOf(p, await this.leads.companies(me, p, false));
  }

  @Post("companies") @Requires("leads", "import") @UseInterceptors(sheet) @HttpCode(200)
  async importCompanies(@Me() me: CurrentUser, @UploadedFile() file?: UploadedSheet) {
    return doneOf(await this.leads.companies(me, await companiesBook(file), true));
  }
}
