import { Module } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { LeadsRepository } from "./leads.repository";
import { LeadDuplicatesController } from "./duplicates.controller";
import { LeadDuplicatesService } from "./duplicates.service";
import { SettingsModule } from "../settings/settings.module";
import { RoutingController } from "./routing.controller";
import { RoutingService } from "./routing.service";

/** M-01 · العملاء المحتملين والتوزيع. The reference module: copy its shape for every other module. */
@Module({
  imports: [SettingsModule], // the SLA rules (M-13) for the list's SLA column
  controllers: [LeadDuplicatesController, RoutingController, LeadsController], // first: «leads/duplicates», «leads/routing» must win over «leads/:id»
  providers: [LeadsService, LeadDuplicatesService, RoutingService, LeadsRepository],
  exports: [LeadsService],
})
export class LeadsModule {}
