import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CalendarDay, ReportDay } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { DailyReportService } from "./daily-report.service";

/** 2.18 · the inventory's daily report: Manar (`inventory: approve`) reads and approves it. */
@Controller("inventory/daily-report")
export class DailyReportController {
  constructor(private readonly reports: DailyReportService) {}

  @Get()
  @Requires("inventory", "approve")
  get(@Query(new ZodPipe(ReportDay)) q: ReportDay) {
    return this.reports.get(q.day);
  }

  @Post(":day/approve")
  @Requires("inventory", "approve")
  approve(@Me() me: CurrentUser, @Param("day", new ZodPipe(CalendarDay)) day: string) {
    return this.reports.approve(me, day);
  }
}
