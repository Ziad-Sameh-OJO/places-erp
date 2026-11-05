import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { LeadsModule } from "../leads/leads.module";
import { ImportsController } from "./imports.controller";

/** 13.1 · the old data's import; saving is each module's service, in its own transaction. */
@Module({ imports: [InventoryModule, LeadsModule], controllers: [ImportsController] })
export class ImportsModule {}
