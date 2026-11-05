import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { SettingsModule } from "../settings/settings.module";
import { TasksController } from "./tasks.controller";
import { TasksRepository } from "./tasks.repository";
import { TasksService } from "./tasks.service";

/** M-04 · التسويق والحملات: the tasks board (4.1) so far; campaigns, the content plan and the Broadcast follow. */
@Module({
  imports: [InventoryModule, SettingsModule], // the task's unit · «أنواع تاسكات التسويق» (M-13)
  controllers: [TasksController],
  providers: [TasksService, TasksRepository],
  exports: [TasksService],
})
export class MarketingModule {}
