import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { ClientsModule } from "../clients/clients.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryRepository } from "./inventory.repository";
import { UnitsService } from "./units.service";
import { UnitLocksController } from "./unit-locks.controller";
import { AreaTabsController } from "./area-tabs.controller";
import { AreaTabsService } from "./area-tabs.service";
import { NotActiveController } from "./not-active.controller";
import { NotActiveService } from "./not-active.service";
import { NotActiveRepository } from "./not-active.repository";

/** M-03 · مخزون الوحدات: the units (2.1–2.7), Not Active sheets (2.14), closing them after a Done Deal (2.9). PDF and the team's work come with their tasks. */
@Module({
  imports: [SettingsModule, ClientsModule], // the areas list (M-13) · the owner's file (M-10 2.1, 2.11)
  controllers: [AreaTabsController, UnitLocksController, InventoryController, NotActiveController],
  providers: [InventoryService, UnitsService, AreaTabsService, InventoryRepository, NotActiveService, NotActiveRepository],
  exports: [InventoryService, UnitsService], // UnitsService.lock / release: the deals (5.5) and contracts (6.4)
})
export class InventoryModule {}
