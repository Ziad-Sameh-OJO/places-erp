import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryRepository } from "./inventory.repository";
import { AreaTabsController } from "./area-tabs.controller";
import { AreaTabsService } from "./area-tabs.service";

/** M-03 · مخزون الوحدات: the units (2.1–2.7). PDF, closing, Not Active and the team's work come with their tasks. */
@Module({
  imports: [SettingsModule], // the areas list (M-13)
  controllers: [AreaTabsController, InventoryController],
  providers: [InventoryService, AreaTabsService, InventoryRepository],
  exports: [InventoryService],
})
export class InventoryModule {}
