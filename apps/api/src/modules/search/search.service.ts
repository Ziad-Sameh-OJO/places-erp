import { Injectable } from "@nestjs/common";
import type { SearchHit, SearchResult } from "@places/contracts";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { LeadsService } from "../leads/leads.service";
import { InventoryService } from "../inventory/inventory.service";
import { ClientsService } from "../clients/clients.service";
import { DealsService } from "../deals/deals.service";
import { TicketsService } from "../tickets/tickets.service";
import { HrService } from "../hr/hr.service";

const EACH = 5;
const some = (...parts: (string | null | undefined)[]) => parts.filter((p): p is string => !!p);

/**
 * 0.17 · «بحث سريع» (demo app.js cmdItems): each module's own list with the words typed, so its data scope, its
 * field permissions (a hidden field isn't searched and doesn't come back) and its rules stay in one place. A kind
 * shows only with that module's «view»; at most 5 of each.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly leads: LeadsService, private readonly units: InventoryService, private readonly clients: ClientsService,
    private readonly deals: DealsService, private readonly tickets: TicketsService, private readonly hr: HrService,
  ) {}

  async search(me: CurrentUser, q: string): Promise<SearchResult> {
    const page = { page: 1, pageSize: EACH, q };
    const may = (m: Parameters<CurrentUser["grants"]["can"]>[0]) => me.grants.can(m, "view");
    const none = Promise.resolve([] as SearchHit[]);
    const found = await Promise.all([
      may("leads") ? this.leads.list(me, page).then((r) => r.items.map((l): SearchHit => ({ kind: "lead", id: l.id, label: l.name, sub: some(l.code, l.phones.join(" / "), l.area) }))) : none,
      may("inventory") ? this.units.list(me, { ...page, view: "available" }).then((r) => r.items.map((u): SearchHit => ({ kind: "unit", id: u.id, label: some(u.code, u.project).join(" · "), sub: some(u.type, u.area), ...(u.space ? { meters: u.space } : {}) }))) : none,
      may("clients") ? this.clients.list(me, page).then((r) => r.items.map((c): SearchHit => ({ kind: "client", id: c.id, label: c.name, sub: some(c.company, c.phones?.join(" / ")) }))) : none,
      may("deals") ? this.deals.list(me, page).then((r) => r.items.map((d): SearchHit => ({ kind: "deal", id: d.id, label: some(d.code, d.company).join(" · "), sub: some(d.unitCode, d.tcrs.join(" ")) }))) : none,
      may("tickets") ? this.tickets.list(me, { ...page, view: "all" }).then((r) => r.items.map((t): SearchHit => ({ kind: "ticket", id: t.id, label: t.title, sub: some(t.code, t.department) }))) : none,
      may("hr") ? this.hr.list(me, { q }).then((r) => r.items.slice(0, EACH).map((e): SearchHit => ({ kind: "employee", id: e.id, label: e.name, sub: some(e.jobTitle, e.department) }))) : none,
    ]);
    return { hits: found.flat() };
  }
}
