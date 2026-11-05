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

/** M-01 · العملاء المحتملين والتوزيع. The reference module: copy its shape for every other module. */
@Module({
  imports: [SettingsModule, AccessModule, InventoryModule, HrModule], // HrModule: who is on approved leave today (1.15) · // InventoryModule: the units a Visit lists (1.9) · // the lists and holidays (M-13); the roles for «مين يتبلّغ» (1.29) // the SLA rules (M-13) for the list's SLA column
  controllers: [LeadDuplicatesController, RoutingController, LeadRulesController, LeadsController], // first: «leads/duplicates», «leads/routing» must win over «leads/:id»
  providers: [LeadsService, LeadDuplicatesService, RoutingService, LeadRulesService, LeadsRepository],
  exports: [LeadsService, LeadRulesService],
})
export class LeadsModule {}
