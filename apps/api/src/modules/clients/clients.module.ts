import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
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
  imports: [SettingsModule], // «أنواع التواصل مع العميل» (M-13 list)
  controllers: [ClientMergesController, ClientsController], // first: «clients/merges» must win over «clients/:id»
  providers: [ClientsService, ClientMergesService, ClientsRepository],
  exports: [ClientsService],
})
export class ClientsModule {}
