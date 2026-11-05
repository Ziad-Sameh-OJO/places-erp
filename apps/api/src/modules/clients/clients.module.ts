import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { ClientsRepository } from "./clients.repository";

/**
 * M-10 · العملاء والملاك: one file per client and owner. Leads (Done Deal, a returning client) and the inventory
 * (an owner's first unit) call ClientsService inside their own transactions.
 */
@Module({
  imports: [SettingsModule], // «أنواع التواصل مع العميل» (M-13 list)
  controllers: [ClientsController],
  providers: [ClientsService, ClientsRepository],
  exports: [ClientsService],
})
export class ClientsModule {}
