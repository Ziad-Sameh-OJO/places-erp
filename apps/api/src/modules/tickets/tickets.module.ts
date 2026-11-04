import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { TicketsController } from "./tickets.controller";
import { TicketsRepository } from "./tickets.repository";
import { TicketsService } from "./tickets.service";

/** M-06 · التذاكر الداخلية: types and their routes, replies, transfer, close, the response report. The SLA escalation runs in apps/worker. */
@Module({
  imports: [SettingsModule], // «أقسام التذاكر» (M-13)
  controllers: [TicketsController],
  providers: [TicketsService, TicketsRepository],
  exports: [TicketsService], // the Excuse (7.4) opens and settles its ticket through it
})
export class TicketsModule {}
