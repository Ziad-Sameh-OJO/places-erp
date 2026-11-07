import { addPairs } from "./translate.ts";
import core from "./core.ts";
import leads from "./leads.ts";
import kpis from "./kpis.ts";
import finance from "./finance.ts";
import hr from "./hr.ts";
import deals from "./deals.ts";
import access from "./access.ts";
import inventory from "./inventory.ts";
import marketing from "./marketing.ts";
import procurement from "./procurement.ts";
import settings from "./settings.ts";
import clients from "./clients.ts";
import tickets from "./tickets.ts";
import contracts from "./contracts.ts";
import imports from "./imports.ts";
import worker from "./worker.ts";
import validation from "./validation.ts";
import domain from "./domain.ts";

// one file per area so the catalog grows module by module without everyone editing one list
for (const pairs of [domain, validation, core, leads, kpis, finance, hr, deals, access, inventory, marketing, procurement, settings, clients, tickets, contracts, imports, worker]) addPairs(pairs);

export { translate, type Pair, type ServerLocale } from "./translate.ts";
