import { Module } from "@nestjs/common";
import { DealsModule } from "../deals/deals.module";
import { SettingsModule } from "../settings/settings.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractsRepository } from "./contracts.repository";

/** M-11 · العقود: a Done Deal's contract, its installment table, the payments on it and their receipts (6.5 · 6.7). */
@Module({
  imports: [DealsModule, SettingsModule, InventoryModule], // the deal a contract belongs to, the receipt template (12.12), the unit's lock (UnitsService, 6.4)
  controllers: [ContractsController],
  providers: [ContractsService, ContractsRepository],
  exports: [ContractsService],
})
export class ContractsModule {}
