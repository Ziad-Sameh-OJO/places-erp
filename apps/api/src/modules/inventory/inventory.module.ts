import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryRepository } from "./inventory.repository";

/** M-03 · مخزون الوحدات: the units (2.1–2.7). PDF, closing, Not Active and the team's work come with their tasks. */
@Module({
  imports: [SettingsModule], // the areas list (M-13)
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository],
  exports: [InventoryService],
})
export class InventoryModule {}
