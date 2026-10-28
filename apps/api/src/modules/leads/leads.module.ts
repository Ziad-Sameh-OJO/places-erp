import { Module } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { LeadsRepository } from "./leads.repository";

/** M-01 · العملاء المحتملين والتوزيع. The reference module: copy its shape for every other module. */
@Module({ controllers: [LeadsController], providers: [LeadsService, LeadsRepository], exports: [LeadsService] })
export class LeadsModule {}
