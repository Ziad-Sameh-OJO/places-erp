import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { SettingsModule } from "../settings/settings.module";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsRepository } from "./campaigns.repository";
import { CampaignsService } from "./campaigns.service";
import { NewUnitsController } from "./new-units.controller";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";
import { TasksController } from "./tasks.controller";
import { TasksRepository } from "./tasks.repository";
import { TasksService } from "./tasks.service";

/** M-04 · التسويق والحملات: the tasks board (4.1-4.3) and the campaigns and their dashboard (4.5-4.6), the content plan (4.7). */
@Module({
  imports: [InventoryModule, SettingsModule], // the task's unit · «أنواع تاسكات التسويق» and «الـ Channels» (M-13)
  controllers: [TasksController, CampaignsController, PostsController, NewUnitsController],
  providers: [TasksService, TasksRepository, CampaignsService, CampaignsRepository, PostsService],
  exports: [TasksService],
})
export class MarketingModule {}
