import { Injectable } from "@nestjs/common";
import type { LeadTodayItem } from "@places/contracts";
import { inboxOrder, localDate, seesVisitsOnBoard, visitDue } from "@places/domain";
import { ownedBy } from "../../core/authz/scope";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { LeadsService } from "./leads.service";
import { LeadsTodayRepository } from "./today.repository";

/**
 * «مهامي النهارده» from the leads (1.22, demo home.js), always inside the caller's scope (a salesperson his own leads,
 * a TL his team's, Operations everyone's): leads whose SLA clock passed the warning (M-01 Q4), and the visits due
 * today or late and not marked Done yet (sales, TL and admin only, as in the demo).
 */
@Injectable()
export class LeadsTodayService {
  constructor(private readonly repo: LeadsTodayRepository, private readonly leads: LeadsService) {}

  async items(me: CurrentUser): Promise<LeadTodayItem[]> {
    const now = new Date();
    const scope = ownedBy(me) as never;
    const [candidates, visits, sla] = await Promise.all([
      this.repo.slaCandidates(scope),
      seesVisitsOnBoard(me.roles) ? this.repo.dueVisits(scope, localDate(now)) : Promise.resolve([]),
      this.leads.slaClock(now),
    ]);
    const late = candidates.map((l) => ({ l, s: sla(l) })).filter((x) => x.s && x.s.level !== "ok");
    const names = new Map((await this.repo.employeeNames([...new Set([...late.map((x) => x.l.assignedToId), ...visits.map((v) => v.lead.assignedToId)].filter((id): id is string => !!id))])).map((e) => [e.id, e.name]));
    const nameOf = (id: string | null) => (id ? names.get(id) ?? null : null);

    const slaItems = late.map(({ l, s }): LeadTodayItem => ({
      kind: "sla", tone: "bad", lead: { id: l.id, name: l.name }, salesperson: nameOf(l.assignedToId), sla: s, visit: null,
    }));
    const visitItems = visits.flatMap((v): LeadTodayItem[] => {
      const tone = visitDue(v.at, now);
      if (tone === null) return [];
      return [{ kind: "visit", tone, lead: { id: v.lead.id, name: v.lead.name }, salesperson: nameOf(v.lead.assignedToId), sla: null,
        visit: { id: v.id, kind: v.kind === "meeting" ? "Meeting" : "Visit", at: v.at.toISOString() } }];
    });
    return inboxOrder([...slaItems, ...visitItems]);
  }
}
