import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { InventoryModule } from "../inventory/inventory.module";
import { FinanceModule } from "../finance/finance.module";
import { KpisModule } from "../kpis/kpis.module";
import { SettingsModule } from "../settings/settings.module";
import { DealsController } from "./deals.controller";
import { DealsService } from "./deals.service";
import { DealsRepository } from "./deals.repository";
import { DealMarketingController } from "./deal-marketing.controller";
import { DealMarketingService } from "./deal-marketing.service";
import { DealSheetController } from "./deal-sheet.controller";
import { DealSheetService } from "./deal-sheet.service";
import { DealSheetRepository } from "./deal-sheet.repository";

/** M-02 · الصفقات: the Done Deal and the Office Manager's review. Collections, TCR and commission come with their tasks. */
@Module({
  imports: [LeadsModule, InventoryModule, FinanceModule, SettingsModule, KpisModule], // the deal's lead (moves to Done Deal), unit (open units, its agent = Seller), the ledger and vouchers (5.3 · 9.12), the TCR's letterhead (5.13 · 12.12), the TL's monthly figure (5.8), Achievements (5.10)
  controllers: [DealMarketingController, DealSheetController, DealsController], // first: «deals/marketing» and «deals/sheet» must win over «deals/:id»
  providers: [DealsService, DealMarketingService, DealsRepository, DealSheetService, DealSheetRepository],
  exports: [DealsService],
})
export class DealsModule {}
