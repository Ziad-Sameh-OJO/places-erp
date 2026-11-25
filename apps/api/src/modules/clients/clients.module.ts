import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { FinanceModule } from "../finance/finance.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { ClientsRepository } from "./clients.repository";
import { ClientMergesController } from "./client-merges.controller";
import { ClientMergesService } from "./client-merges.service";

/**
 * M-10 · العملاء والملاك: one file per client and owner. Leads (Done Deal, a returning client) and the inventory
 * (an owner's first unit) call ClientsService inside their own transactions.
 */
@Module({
  imports: [SettingsModule, FinanceModule], // «أنواع التواصل مع العميل» (M-13 list) · a merge moves the client's 113 account (9.12)
  controllers: [ClientMergesController, ClientsController], // first: «clients/merges» must win over «clients/:id»
  providers: [ClientsService, ClientMergesService, ClientsRepository],
  exports: [ClientsService],
})
export class ClientsModule {}
