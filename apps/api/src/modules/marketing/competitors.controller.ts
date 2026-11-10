import { Controller, Get } from "@nestjs/common";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ReportsService } from "../kpis/reports.service";

/** The scheduled report (11.10, seeded) Rahma hands in by the 30th: what the competitors put out + an analysis (11.9). */
const COMPETITORS_REPORT = "sr-competitors";

/**
 * HTTP only. M-04 · the dashboard's «تقرير المنافسين الشهري» card (4.11): handed in this month or not, and the latest
 * ones. Handing it in goes through the report itself (`POST /reports/scheduled/:id/hand-in`, only the one it names).
 */
@Controller("marketing/competitors-report")
export class CompetitorsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @Requires("marketing", "view")
  async card(@Me() me: CurrentUser) {
    return { card: await this.reports.card(me, COMPETITORS_REPORT) };
  }
}
