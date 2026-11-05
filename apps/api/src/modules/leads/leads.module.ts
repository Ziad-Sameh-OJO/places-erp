import { ClientsModule } from "../clients/clients.module";
import { Module } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { LeadsRepository } from "./leads.repository";
import { LeadDuplicatesController } from "./duplicates.controller";
import { LeadDuplicatesService } from "./duplicates.service";
import { SettingsModule } from "../settings/settings.module";
import { RoutingController } from "./routing.controller";
import { RoutingService } from "./routing.service";
import { LeadRulesService } from "./lead-rules.service";
import { LeadRulesController } from "./lead-rules.controller";
import { AccessModule } from "../access/access.module";
import { InventoryModule } from "../inventory/inventory.module";
import { HrModule } from "../hr/hr.module";
import { RotationController } from "./rotation.controller";
import { RotationService } from "./rotation.service";
import { VisitPostponeController } from "./visit-postpone.controller";
import { VisitPostponeService } from "./visit-postpone.service";
import { LeadsTodayController } from "./today.controller";
import { LeadBulkController } from "./bulk.controller";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { CompaniesRepository } from "./companies.repository";
import { LeadBulkService } from "./bulk.service";
import { LeadBulkRepository } from "./bulk.repository";
import { LeadsTodayService } from "./today.service";
import { LeadsTodayRepository } from "./today.repository";
import { LeadImportService } from "./import.service";
import { SecondCallsController } from "./second-calls.controller";
import { SecondCallsService } from "./second-calls.service";
import { SecondCallsRepository } from "./second-calls.repository";
import { NewLeadsController } from "./new-leads.controller";
import { NewLeadsService } from "./new-leads.service";

/** M-01 · العملاء المحتملين والتوزيع. The reference module: copy its shape for every other module. */
@Module({
  imports: [SettingsModule, AccessModule, InventoryModule, HrModule, ClientsModule], // ClientsModule: the client file on Done Deal (M-10) · // HrModule: who is on approved leave today (1.15) · // InventoryModule: the units a Visit lists (1.9) · // the lists and holidays (M-13); the roles for «مين يتبلّغ» (1.29) // the SLA rules (M-13) for the list's SLA column
  controllers: [LeadDuplicatesController, NewLeadsController, LeadBulkController, SecondCallsController, RoutingController, RotationController, LeadRulesController, VisitPostponeController, LeadsController, LeadsTodayController, CompaniesController], // first: «leads/duplicates», «leads/new-leads», «leads/routing» must win over «leads/:id»
  providers: [LeadsService, LeadDuplicatesService, NewLeadsService, RoutingService, LeadRulesService, LeadsRepository, RotationService, VisitPostponeService, LeadsTodayService, LeadsTodayRepository, LeadBulkService, LeadBulkRepository, SecondCallsService, SecondCallsRepository, LeadImportService, CompaniesService, CompaniesRepository], // 1.23 · 1.24 · 1.22
  exports: [LeadsService, LeadRulesService, LeadImportService], // LeadImportService: 13.1
})
export class LeadsModule {}
