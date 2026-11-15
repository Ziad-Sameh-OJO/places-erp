import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { CompetitorInput, CompetitorStrength, CompetitorsQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ReportsService } from "../kpis/reports.service";
import { CompetitorsService } from "./competitors.service";

/** The scheduled report (11.10, seeded) Rahma hands in by the 30th: what the competitors put out + an analysis (11.9). */
const COMPETITORS_REPORT = "sr-competitors";

/**
 * HTTP only. M-04 · the dashboard's «تقرير المنافسين الشهري» card (4.11): handed in this month or not, and the latest
 * ones. Handing it in goes through the report itself (`POST /reports/scheduled/:id/hand-in`, only the one it names).
 * 14.14 · its rows: the competitors of a month, each rated «قوي / مش قوي» by the marketing manager (approve).
 */
@Controller("marketing/competitors-report")
export class CompetitorsController {
  constructor(private readonly reports: ReportsService, private readonly competitors: CompetitorsService) {}

  @Get()
  @Requires("marketing", "view")
  async card(@Me() me: CurrentUser) {
    return { card: await this.reports.card(me, COMPETITORS_REPORT) };
  }

  @Get("rows")
  @Requires("marketing", "view")
  rows(@Query(new ZodPipe(CompetitorsQuery)) q: CompetitorsQuery) {
    return this.competitors.list(q.month);
  }

  @Post("rows")
  @Requires("marketing", "create")
  add(@Me() me: CurrentUser, @Body(new ZodPipe(CompetitorInput)) body: CompetitorInput) {
    return this.competitors.add(me, body);
  }

  @Patch("rows/:id")
  @Requires("marketing", "approve")
  rate(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(CompetitorStrength)) body: CompetitorStrength) {
    return this.competitors.rate(me, id, body.strong);
  }

  @Delete("rows/:id")
  @HttpCode(204)
  @Requires("marketing", "delete")
  remove(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.competitors.remove(me, id);
  }
}
