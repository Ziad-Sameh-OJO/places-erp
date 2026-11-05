import { Module } from "@nestjs/common";
import { DealsModule } from "../deals/deals.module";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractsRepository } from "./contracts.repository";

/** M-11 · العقود: a Done Deal's contract and its installment table. Payments and alerts come with their tasks. */
@Module({
  imports: [DealsModule], // the deal a contract belongs to, through its service
  controllers: [ContractsController],
  providers: [ContractsService, ContractsRepository],
  exports: [ContractsService],
})
export class ContractsModule {}
