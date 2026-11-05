import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { MarketingModule } from "../marketing/marketing.module";
import { HandoverController } from "./handover.controller";
import { HandoverService } from "./handover.service";

/** M-09 2.2 · 7.1: a leaver's leads and tasks move with the direct manager's approval (apart from AccessModule, which LeadsModule imports). */
@Module({ imports: [LeadsModule, MarketingModule], controllers: [HandoverController], providers: [HandoverService] })
export class HandoverModule {}
