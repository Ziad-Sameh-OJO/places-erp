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

/** M-01 · العملاء المحتملين والتوزيع. The reference module: copy its shape for every other module. */
@Module({
  imports: [SettingsModule, AccessModule], // the lists and holidays (M-13); the roles for «مين يتبلّغ» (1.29) // the SLA rules (M-13) for the list's SLA column
  controllers: [LeadDuplicatesController, RoutingController, LeadRulesController, LeadsController], // first: «leads/duplicates», «leads/routing» must win over «leads/:id»
  providers: [LeadsService, LeadDuplicatesService, RoutingService, LeadRulesService, LeadsRepository],
  exports: [LeadsService, LeadRulesService],
})
export class LeadsModule {}
