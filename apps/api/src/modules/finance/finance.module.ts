import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller";
import { LedgerService } from "./ledger.service";
import { LedgerRepository } from "./ledger.repository";
import { VouchersService } from "./vouchers.service";
import { VouchersRepository } from "./vouchers.repository";
import { BillsService } from "./bills.service";
import { PayrollService } from "./payroll.service";
import { HrModule } from "../hr/hr.module";

/**
 * M-07 · المالية. 9.1 + 9.5: the chart of accounts and the journal; LedgerService.post() is the one engine every
 * movement (vouchers, manual entries, payroll, procurement) posts through, so it is exported, with VouchersService.recordExpense() for procurement (9.3 → 10.2).
 */
@Module({
  imports: [HrModule], // the deductions HR approved (7.9) for payroll
  controllers: [FinanceController],
  providers: [LedgerService, LedgerRepository, VouchersService, VouchersRepository, BillsService, PayrollService],
  exports: [LedgerService, VouchersService],
})
export class FinanceModule {}
