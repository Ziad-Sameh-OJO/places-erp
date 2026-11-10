import { Injectable } from "@nestjs/common";
import type { LeadTodayItem } from "@places/contracts";
import { LEAD_STAGES, backToTelesales, draftAdminAlarm, inboxOrder, isNamedIn, localDate, noAnswerReminderDue, seesVisitsOnBoard, tlNoteUnseen, visitDue } from "@places/domain";
import { ownedBy } from "../../core/authz/scope";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import { LeadsService } from "./leads.service";
import { LeadRulesService } from "./lead-rules.service";
import { NewLeadsService } from "./new-leads.service";
import { LeadsTodayRepository } from "./today.repository";

const TELESALES = "telesales", SALES = "sales", ADMIN = "admin"; // role keys (seed-data/roles.json)
const STAGE = new Map<string, string>(LEAD_STAGES.map((s) => [s.toUpperCase().replace(/ /g, "_"), s]));
const NO_ANSWER_LINES = 5; // demo home.js: the first five

/**
 * «مهامي النهارده» from the leads (1.22 · 1.34, demo home.js), each line only for whom the demo shows it, always inside
 * the caller's scope: the SLA alarms (M-01 Q4) · Operations' New Leads from Telesales with their clock · Telesales'
 * leads back on the 3rd rotation · the Draft Admin's daily Alarm (the rule's people) · postponements waiting for the
 * TL the rules name · the day's visits (sales, TL, admin) · the TL's note (1.33) · the salesperson's «كلّمه» on a No
 * Answer every noAnswer.remindH working hours since the mark or the last call (Q5).
 */
@Injectable()
export class LeadsTodayService {
  constructor(
    private readonly repo: LeadsTodayRepository,
    private readonly leads: LeadsService,
    private readonly newLeads: NewLeadsService,
    private readonly rules: LeadRulesService,
    private readonly time: BusinessTimeService,
  ) {}

  async items(me: CurrentUser): Promise<LeadTodayItem[]> {
    const now = new Date();
    const scope = ownedBy(me) as never;
    const mine = me.employeeId;
    const rules = await this.rules.get();
    const isAdmin = me.roles.includes(ADMIN);
    const [candidates, visits, sla, notes, newLeads, back, drafts, postpones, noAnswer, calendar] = await Promise.all([
      this.repo.slaCandidates(scope),
      seesVisitsOnBoard(me.roles) ? this.repo.dueVisits(scope, localDate(now)) : Promise.resolve([]),
      this.leads.slaClock(now),
      mine ? this.repo.tlNotes(mine) : Promise.resolve([]),
      me.grants.can("leads", "approve") ? this.newLeads.pending(me, now) : Promise.resolve([]),
      mine && me.roles.includes(TELESALES) ? this.repo.telesalesBack(mine, rules.noAnswer.toTelesalesAt) : Promise.resolve([]),
      isAdmin || isNamedIn(rules.draftAdmin.see, { userId: me.id, roles: me.roles }) ? this.repo.draftAdminWaiting() : Promise.resolve([]),
      this.repo.pendingPostpones(),
      mine && me.roles.includes(SALES) ? this.repo.noAnswerLeads(mine) : Promise.resolve([]),
      this.time.calendar(),
    ]);
    // a postponement is on the board of whom the lead rules name for that salesperson (their TL by default) and the admin's
    const deciding = (await Promise.all(postpones.map(async (v) => (v.lead.assignedToId && (isAdmin || (await this.leads.canDecidePostpone(me, v.lead.assignedToId)))) ? v : null)))
      .filter((v): v is (typeof postpones)[number] => !!v);
    const late = candidates.map((l) => ({ l, s: sla(l) })).filter((x) => x.s && x.s.level !== "ok");
    const ids = [...late.map((x) => x.l.assignedToId), ...visits.map((v) => v.lead.assignedToId), ...deciding.map((v) => v.lead.assignedToId), ...drafts.map((d) => d.fromId)];
    const names = new Map((await this.repo.employeeNames([...new Set(ids.filter((id): id is string => !!id))])).map((e) => [e.id, e.name]));
    const nameOf = (id: string | null) => (id ? names.get(id) ?? null : null);
    const line = (x: Pick<LeadTodayItem, "kind" | "tone" | "lead"> & Partial<LeadTodayItem>): LeadTodayItem => ({ salesperson: null, sla: null, visit: null, tlNote: null, ...x });
    const kindOf = (k: string) => (k === "meeting" ? "Meeting" : "Visit") as "Visit" | "Meeting";

    const slaItems = late.map(({ l, s }) => line({ kind: "sla", tone: "bad", lead: { id: l.id, name: l.name }, salesperson: nameOf(l.assignedToId), sla: s }));
    // demo: «باقي N دقيقة عشان يتحسب في الميعاد» / «اتأخرت N دقيقة» on Operations' KPI clock (11.15)
    const newLeadItems = newLeads.map((r) => line({ kind: "newLead", tone: r.minutesLeft < 0 ? "bad" : "warn", lead: { id: r.id, name: r.name }, minutesLeft: r.minutesLeft }));
    const backItems = back.filter((l) => backToTelesales(l, rules)).map((l) => line({ kind: "telesales", tone: "", lead: { id: l.id, name: l.name } }));
    const alarm = draftAdminAlarm(drafts, now);
    const draftItems = alarm ? [line({ kind: "draftAdmin", tone: "bad", lead: null,
      drafts: { ...alarm, leads: drafts.slice(0, 4).map((d) => ({ name: d.lead.name, stage: STAGE.get(d.lead.stage) ?? d.lead.stage, from: nameOf(d.fromId) })) } })] : [];
    const postponeItems = deciding.map((v) => line({ kind: "postpone", tone: "warn", lead: { id: v.lead.id, name: v.lead.name }, salesperson: nameOf(v.lead.assignedToId),
      visit: { id: v.id, kind: kindOf(v.kind), at: v.at.toISOString() }, reason: v.postponeReason ?? "" }));
    const visitItems = visits.flatMap((v) => {
      const tone = visitDue(v.at, now);
      return tone === null ? [] : [line({ kind: "visit", tone, lead: { id: v.lead.id, name: v.lead.name }, salesperson: nameOf(v.lead.assignedToId), visit: { id: v.id, kind: kindOf(v.kind), at: v.at.toISOString() } })];
    });
    // 1.33: the Team Leader's note on the salesperson's own lead, until they open it (demo home.js «ملاحظة TL على …»)
    const noteItems = notes.filter(tlNoteUnseen).map((l) => line({ kind: "tlNote", tone: "", lead: { id: l.id, name: l.name }, tlNote: l.tlNote }));
    // Q5: the clock restarts at the mark and at every logged call (the board doesn't wait for the worker's Alarm)
    const noAnswerItems = noAnswer
      .filter((l) => noAnswerReminderDue({ naMarkedAt: l.naMarkedAt, lastCallAt: l.calls[0]?.at ?? null, remindedAt: null }, now, rules, calendar.holidays))
      .slice(0, NO_ANSWER_LINES).map((l) => line({ kind: "noAnswer", tone: "warn", lead: { id: l.id, name: l.name }, remindH: rules.noAnswer.remindH }));
    return inboxOrder([...slaItems, ...newLeadItems, ...backItems, ...draftItems, ...postponeItems, ...visitItems, ...noteItems, ...noAnswerItems]);
  }
}
