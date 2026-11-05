import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { InventoryModule } from "../inventory/inventory.module";
import { DealsController } from "./deals.controller";
import { DealsService } from "./deals.service";
import { DealsRepository } from "./deals.repository";
import { DealMarketingController } from "./deal-marketing.controller";
import { DealMarketingService } from "./deal-marketing.service";

/** M-02 · الصفقات: the Done Deal and the Office Manager's review. Collections, TCR and commission come with their tasks. */
@Module({
  imports: [LeadsModule, InventoryModule], // the deal's lead (moves to Done Deal) and unit (open units, its agent = Seller)
  controllers: [DealMarketingController, DealsController], // first: «deals/marketing» must win over «deals/:id»
  providers: [DealsService, DealMarketingService, DealsRepository],
  exports: [DealsService],
})
export class DealsModule {}
