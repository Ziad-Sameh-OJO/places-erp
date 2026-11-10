import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { ClientsModule } from "../clients/clients.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryRepository } from "./inventory.repository";
import { UnitsService } from "./units.service";
import { UnitLocksController } from "./unit-locks.controller";
import { UnitAgreementController, UnitLayoutsController, UnitPhotosController } from "./unit-photos.controller";
import { UnitLayoutsService } from "./unit-layouts.service";
import { UnitPhotosService } from "./unit-photos.service";
import { UnitDocumentsController, UnitListsController } from "./unit-documents.controller";
import { UnitDocumentsService } from "./unit-documents.service";
import { TeamTasksController } from "./team-tasks.controller";
import { TeamTasksService } from "./team-tasks.service";
import { DailyReportController } from "./daily-report.controller";
import { DailyReportService } from "./daily-report.service";
import { AreaTabsController } from "./area-tabs.controller";
import { AreaTabsService } from "./area-tabs.service";
import { NotActiveController } from "./not-active.controller";
import { NotActiveService } from "./not-active.service";
import { NotActiveRepository } from "./not-active.repository";
import { InventoryTodayController } from "./today.controller";
import { ListRequestsController } from "./list-requests.controller";
import { ListRequestsService } from "./list-requests.service";
import { TicketsModule } from "../tickets/tickets.module";

/** M-03 · مخزون الوحدات: the units (2.1–2.7), Not Active sheets (2.14), closing them after a Done Deal (2.9). PDF and the team's work come with their tasks. */
@Module({
  imports: [SettingsModule, ClientsModule, TicketsModule], // the areas list (M-13) · the owner's file (M-10 2.1, 2.11) · a List request's ticket (2.32)
  controllers: [AreaTabsController, UnitLocksController, UnitPhotosController, UnitLayoutsController, UnitAgreementController, UnitDocumentsController, UnitListsController, TeamTasksController, DailyReportController, InventoryController, NotActiveController, InventoryTodayController, ListRequestsController],
  providers: [InventoryService, UnitsService, UnitPhotosService, UnitLayoutsService, UnitDocumentsService, TeamTasksService, DailyReportService, AreaTabsService, InventoryRepository, NotActiveService, NotActiveRepository, ListRequestsService],
  // UnitsService.lock / release: the deals (5.5) and contracts (6.4) · UnitPhotosService: the Retouch task's folder (4.12)
  exports: [InventoryService, UnitsService, UnitPhotosService],
})
export class InventoryModule {}
