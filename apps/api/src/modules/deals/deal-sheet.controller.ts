import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { AchievementsQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { sendXlsx } from "../../core/http/excel";
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
      { header: "deal date", value: (x) => x.d.closedAt.slice(0, 10) },
    ], await this.sheet.split(me), "تفاصيل الصفقات");
  }
}
