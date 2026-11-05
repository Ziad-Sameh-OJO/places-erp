import { Module } from "@nestjs/common";
import { KpisController } from "./kpis.controller";
import { KpisRepository } from "./kpis.repository";
import { KpisService } from "./kpis.service";
import { ReportsController } from "./reports.controller";
import { ReportsRepository } from "./reports.repository";
import { ReportsService } from "./reports.service";
import { TargetsService } from "./targets.service";

/**
 * M-12 · KPI cards: my card, my team, the whole company, the item source editor, a new quarter, the KPI watcher (11.1–11.4 · 11.11 · 11.14);
 * the scheduled reports and the daily report (11.10 · 11.12), the monthly targets and ranking (11.8).
 */
@Module({ controllers: [KpisController, ReportsController], providers: [KpisService, KpisRepository, ReportsService, ReportsRepository, TargetsService] })
export class KpisModule {}
