import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller";
import { LedgerService } from "./ledger.service";
import { LedgerRepository } from "./ledger.repository";

/**
 * M-07 · المالية. 9.1 + 9.5: the chart of accounts and the journal; LedgerService.post() is the one engine every
 * movement (vouchers, manual entries, payroll, procurement) posts through, so it is exported.
 */
@Module({
  controllers: [FinanceController],
  providers: [LedgerService, LedgerRepository],
  exports: [LedgerService],
})
export class FinanceModule {}
