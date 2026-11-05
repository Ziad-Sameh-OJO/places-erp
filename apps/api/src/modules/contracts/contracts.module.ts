import { Module } from "@nestjs/common";
import { DealsModule } from "../deals/deals.module";
import { SettingsModule } from "../settings/settings.module";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractsRepository } from "./contracts.repository";

/** M-11 · العقود: a Done Deal's contract, its installment table, the payments on it and their receipts (6.5 · 6.7). */
@Module({
  imports: [DealsModule, SettingsModule], // the deal a contract belongs to, through its service · the receipt template (12.12)
  controllers: [ContractsController],
  providers: [ContractsService, ContractsRepository],
  exports: [ContractsService],
})
export class ContractsModule {}
