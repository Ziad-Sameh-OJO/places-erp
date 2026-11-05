import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { SettingsModule } from "../settings/settings.module";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsRepository } from "./campaigns.repository";
import { CampaignsService } from "./campaigns.service";
import { TasksController } from "./tasks.controller";
import { TasksRepository } from "./tasks.repository";
import { TasksService } from "./tasks.service";

/** M-04 · التسويق والحملات: the tasks board (4.1-4.3) and the campaigns (4.5); the content plan and the Broadcast follow. */
@Module({
  imports: [InventoryModule, SettingsModule], // the task's unit · «أنواع تاسكات التسويق» and «الـ Channels» (M-13)
  controllers: [TasksController, CampaignsController],
  providers: [TasksService, TasksRepository, CampaignsService, CampaignsRepository],
  exports: [TasksService],
})
export class MarketingModule {}
