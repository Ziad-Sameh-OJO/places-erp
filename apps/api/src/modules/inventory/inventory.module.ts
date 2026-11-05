import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { ClientsModule } from "../clients/clients.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryRepository } from "./inventory.repository";
import { AreaTabsController } from "./area-tabs.controller";
import { AreaTabsService } from "./area-tabs.service";
import { NotActiveController } from "./not-active.controller";
import { NotActiveService } from "./not-active.service";
import { NotActiveRepository } from "./not-active.repository";

/** M-03 · مخزون الوحدات: the units (2.1–2.7). Not Active sheets (2.14); PDF, closing and the team's work come with their tasks. */
@Module({
  imports: [SettingsModule, ClientsModule], // the areas list (M-13) · the owner's file (M-10 2.1, 2.11)
  controllers: [AreaTabsController, InventoryController, NotActiveController],
  providers: [InventoryService, AreaTabsService, InventoryRepository, NotActiveService, NotActiveRepository],
  exports: [InventoryService],
})
export class InventoryModule {}
