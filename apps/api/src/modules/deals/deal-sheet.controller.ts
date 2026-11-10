import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { AchievementsQuery, DealExportQuery, type DealSheetRow } from "@places/contracts";
import { fromDecimal, localDate } from "@places/domain";
import { ZodPipe } from "../../core/http/zod.pipe";
import { type ExcelColumn, sendXlsx } from "../../core/http/excel";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { DealSheetService } from "./deal-sheet.service";

const SIDE = { buyer: "Buyer", seller: "Seller" } as const;

/** HTTP only (M-02 5.9–5.11), read only. Registered before DealsController so «deals/sheet» isn't read as «deals/:id». */
@Controller("deals")
export class DealSheetController {
  constructor(private readonly sheet: DealSheetService) {}

  @Get("sheet")
  @Requires("deals", "view")
  list(@Me() me: CurrentUser) {
    return this.sheet.sheet(me);
  }

  /** Every salesperson sees the ranking among colleagues (M-02 5.1, demo Leaderboard). */
  @Get("achievements")
  @Requires("deals", "view")
  achievements(@Me() me: CurrentUser, @Query(new ZodPipe(AchievementsQuery)) q: AchievementsQuery) {
    return this.sheet.achievements(me, q.month);
  }

  /** «سجّل تحصيل»'s revenue lines: Finance only, like the collection itself. */
  @Get("collect-form")
  @Requires("finance", "create")
  collectForm() {
    return this.sheet.collectForm();
  }

  /** «تصدير الصفقات» (M-12: any table to Excel, demo U.exportBtn on deals): the list as filtered, its sheet's columns. */
  @Get("export")
  @Requires("deals", "export")
  async export(@Me() me: CurrentUser, @Query(new ZodPipe(DealExportQuery)) q: DealExportQuery, @Res() res: Response) {
    const names = (p: { name: string }[]) => p.map((x) => x.name).join(" · ");
    const pcts = (d: DealSheetRow, s: "buyer" | "seller") => d.shares.filter((x) => x.side === s).map((x) => `${x.schemePercent}%`).join(" / ");
    const comm = (d: DealSheetRow, s: "buyer" | "seller") => d.shares.filter((x) => x.side === s).reduce((t, x) => t + fromDecimal(x.commission), 0) / 100; // summed in piasters
    // M-09: the columns of hidden fields are left out (their values are blank already)
    const hidden = me.fields.hidden("deals");
    const cols: Array<ExcelColumn<DealSheetRow> & { field?: string }> = [
      { header: "الصفقة", value: (d) => d.code, width: 12 },
      { header: "الحالة", value: (d) => d.status, width: 18 },
      { header: "Date", value: (d) => d.firstPaidAt?.slice(0, 7) ?? "" },
      { header: "company", value: (d) => d.company, width: 26 },
      { header: "الوحدة", value: (d) => d.unitCode, width: 14 },
      { header: "space", field: "space", value: (d) => d.space },
      { header: "type", field: "type", value: (d) => d.type },
      { header: "location", field: "location", value: (d) => d.location, width: 22 },
      { header: "buyer", value: (d) => names(d.buyers), width: 24 },
      { header: "seller", value: (d) => names(d.sellers), width: 22 },
      { header: "source", field: "source", value: (d) => d.source },
      { header: "العمولة المتوقعة", field: "expected", value: (d) => (fromDecimal(d.commissionOwner) + fromDecimal(d.commissionClient)) / 100 },
      { header: "owner side", field: "collectedOwner", value: (d) => Number(d.collectedOwner) },
      { header: "client side", field: "collectedClient", value: (d) => Number(d.collectedClient) },
      { header: "net commission", field: "collected", value: (d) => Number(d.collected) },
      { header: "المتبقي", field: "remaining", value: (d) => Number(d.remaining) },
      { header: "buyer %", field: "shares", value: (d) => pcts(d, "buyer") },
      { header: "buyer commission", field: "shares", value: (d) => comm(d, "buyer") },
      { header: "seller %", field: "shares", value: (d) => pcts(d, "seller") },
      { header: "seller commission", field: "shares", value: (d) => comm(d, "seller") },
      { header: "tcr", value: (d) => d.tcrs.join(" · ") },
      { header: "note", field: "note", value: (d) => [d.note, d.targetBase && `التارجت بـ ${d.targetBase}`].filter(Boolean).join(" · "), width: 26 },
      { header: "ميعاد التنفيذ", field: "execDueAt", value: (d) => d.execDueAt ?? "" },
      { header: "اتنفذت", field: "executedAt", value: (d) => d.executedAt ?? "" },
      { header: "أوراق الصفقة", field: "papersOk", value: (d) => (d.papersOk == null ? "لسه ماتراجعتش" : d.papersOk ? "سليمة" : `فيها خطأ: ${d.papersNote ?? ""}`), width: 22 },
      { header: "deal date", value: (d) => localDate(new Date(d.closedAt)) },
    ];
    await sendXlsx<DealSheetRow>(res, "الصفقات.xlsx", cols.filter((c) => !c.field || !hidden.has(c.field)), await this.sheet.exportRows(me, q), "الصفقات");
  }

  /** 5.11: «تفاصيل الصفقات» as Excel (0.11). */
  @Get("split/export")
  @Requires("deals", "export")
  async exportSplit(@Me() me: CurrentUser, @Res() res: Response) {
    await sendXlsx(res, "تفاصيل الصفقات.xlsx", [
      { header: "الصفقة", value: (x) => x.d.code, width: 14 },
      { header: "الشركة", value: (x) => x.d.company, width: 26 },
      { header: "السيلز", value: (x) => x.s.name, width: 22 },
      { header: "الجهة", value: (x) => SIDE[x.s.side] },
      { header: "نصيبه من الكوميشن", value: (x) => Number(x.s.share) },
      { header: "دخل في التارجت", value: (x) => (x.d.offTarget ? "خارج التارجت" : Number(x.s.targetShare)) },
      { header: "نسبته %", value: (x) => x.s.schemePercent },
      { header: "عمولته", value: (x) => Number(x.s.commission) },
      { header: "الـ Team Leader", value: (x) => x.s.tl ?? "", width: 22 },
      { header: "deal date", value: (x) => localDate(new Date(x.d.closedAt)) },
    ], await this.sheet.split(me), "تفاصيل الصفقات");
  }
}
