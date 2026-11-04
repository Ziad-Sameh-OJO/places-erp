import { Module } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { LeadsRepository } from "./leads.repository";
import { LeadDuplicatesController } from "./duplicates.controller";
import { LeadDuplicatesService } from "./duplicates.service";
import { SettingsModule } from "../settings/settings.module";

/** M-01 · العملاء المحتملين والتوزيع. The reference module: copy its shape for every other module. */
@Module({
  imports: [SettingsModule], // the SLA rules (M-13) for the list's SLA column
  controllers: [LeadDuplicatesController, LeadsController], // first: «leads/duplicates» must win over «leads/:id»
  providers: [LeadsService, LeadDuplicatesService, LeadsRepository],
  exports: [LeadsService],
})
export class LeadsModule {}
