import { Module } from "@nestjs/common";
import { KpisModule } from "../kpis/kpis.module";
import { InventoryModule } from "../inventory/inventory.module";
import { FinanceModule } from "../finance/finance.module";
import { HrModule } from "../hr/hr.module";
import { LeadsModule } from "../leads/leads.module";
import { MarketingModule } from "../marketing/marketing.module";
import { ContractsModule } from "../contracts/contracts.module";
import { SettingsModule } from "../settings/settings.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { DashboardRepository } from "./dashboard.repository";

/**
 * 14.1–14.3 · Dashboard (management meeting, 15 Nov): read only. The targets (KPIs), the units' counts (inventory),
 * the money (finance) and the ideal employee (HR) come from their modules' services; the plain counts from its repository.
 * Ahmed's page also takes the SLA clock (leads), the installments (contracts), the cost per Qualified (marketing) and
 * the Near to Close days (settings).
 */
@Module({
  imports: [KpisModule, InventoryModule, FinanceModule, HrModule, LeadsModule, MarketingModule, ContractsModule, SettingsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
