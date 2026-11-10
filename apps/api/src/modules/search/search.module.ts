import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ClientsModule } from "../clients/clients.module";
import { DealsModule } from "../deals/deals.module";
import { TicketsModule } from "../tickets/tickets.module";
import { HrModule } from "../hr/hr.module";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

/** 0.17 · «بحث سريع»: one box over the leads, units, clients, deals, tickets and employees, through each module's service. */
@Module({
  imports: [LeadsModule, InventoryModule, ClientsModule, DealsModule, TicketsModule, HrModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
