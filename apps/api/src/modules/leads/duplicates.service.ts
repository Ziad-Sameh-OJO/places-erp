import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { CreateLead, type DuplicateDecision, type DuplicateRow, type LeadSide } from "@places/contracts";
import { type LeadFacts, mergeDuplicate } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { type DuplicateRecord, LeadsRepository } from "./leads.repository";

/** What was entered the second time, as stored on the duplicate (the new-lead form without the routing choices). */
const Entry = CreateLead.pick({ name: true, company: true, phones: true, area: true, type: true, space: true, condition: true, budget: true, channel: true, campaignId: true });
type Entry = ReturnType<typeof Entry.parse>;

const ALREADY_DECIDED = "القرار ده اتاخد قبل كده";

/**
 * M-01 Q7 · a lead entered again with a mobile we already have. No second lead: the arrival still counts for its
 * channel (M-04 Q22), the existing lead's Activity says who tried, and Operations compares both and decides.
 */
@Injectable()
export class LeadDuplicatesService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadsRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async record(me: CurrentUser, existing: { id: string; code: string }, input: CreateLead) {
    const entry = Entry.parse(input);
    await this.db.$transaction(async (tx) => {
      const arrival = await this.repo.addArrival(tx, { leadId: existing.id, channel: entry.channel, campaignId: entry.campaignId ?? null, duplicate: true, byUserId: me.id });
      const review = await this.repo.addDuplicate(tx, { leadId: existing.id, arrivalId: arrival.id, data: entry, byUserId: me.id });
      await this.repo.addActivity(tx, existing.id, "duplicate", `${me.name} حاول يدخّل العميل ده تاني (${entry.phones.join(" / ")}) · مستني قرار الأوبريشن`, me.id);
      await this.audit.record({ module: "leads", entity: "LeadDuplicate", entityId: review.id, action: "create", userId: me.id, after: { leadId: existing.id, ...entry } }, tx);
    });
    await this.notifications.notify({ event: "lead.duplicate", text: `عميل مكرر: ${entry.name} موجود في ${existing.code} · قرّري أنهي بيانات تفضل`, link: "/leads" });
  }

  /** Operations' queue «طلبات مستنية الأوبريشن»: both sides of every pending duplicate. */
  async pending(): Promise<DuplicateRow[]> {
    const rows = await this.repo.pendingDuplicates();
    const entries = new Map(rows.map((r) => [r.id, Entry.parse(r.data)]));
    const [people, salespeople, campaigns] = await Promise.all([
      this.repo.userNames([...new Set(rows.map((r) => r.byUserId))]),
      this.repo.employeeNames([...new Set(rows.map((r) => r.lead.assignedToId).filter((x): x is string => !!x))]),
      this.repo.campaignNames([...new Set([...entries.values()].map((e) => e.campaignId).filter((x): x is string => !!x))]),
    ]);
    const person = new Map(people.map((p) => [p.userId, p.name]));
    const salesperson = new Map(salespeople.map((s) => [s.id, s.name]));
    const campaign = new Map(campaigns.map((c) => [c.id, c]));
    return rows.map((r) => toRow(r, entries.get(r.id)!, person, salesperson, campaign));
  }

  /** Applies Operations' choice once (two people deciding at once: the second gets 409), audited before / after. */
  async decide(me: CurrentUser, id: string, choice: DuplicateDecision) {
    await this.db.$transaction(async (tx) => {
      const d = await this.repo.duplicate(tx, id);
      if (!d) throw new NotFoundException("طلب التكرار ده مش موجود");
      if (d.decidedAt) throw new ConflictException(ALREADY_DECIDED);
      const existing = factsOfLead(d.lead);
      const { changes, took } = mergeDuplicate(existing, factsOfEntry(Entry.parse(d.data)), choice);
      if (!(await this.repo.claimDuplicate(tx, id, me.id, choice)).count) throw new ConflictException(ALREADY_DECIDED);
      const { phones, ...fields } = changes;
      if (Object.keys(changes).length) await this.repo.updateLead(tx, d.lead.id, { ...fields, ...(phones ? { phones: [...phones] } : {}) });
      const said = took.length ? `اتاخد من الجديد ${took.join("، ")}` : "البيانات القديمة فضلت";
      await this.repo.addActivity(tx, d.lead.id, "duplicate", `الأوبريشن قررت في التكرار: ${said}`, me.id);
      const before = Object.fromEntries(Object.keys(changes).map((k) => [k, existing[k as keyof LeadFacts]]));
      await this.audit.record({ module: "leads", entity: "Lead", entityId: d.lead.id, action: "duplicate-decision", userId: me.id, before, after: { ...changes, decision: choice } }, tx);
    });
  }
}

/** «120000» and «120000.00» are the same budget: compare decimal strings with two places, never as floats. */
const money = (s: string | null | undefined) => {
  if (s == null) return null;
  const [whole, cents = ""] = s.split(".");
  return `${whole}.${cents.padEnd(2, "0")}`;
};

const factsOfLead = (l: DuplicateRecord["lead"]): LeadFacts => ({
  name: l.name, area: l.area, type: l.type, space: l.space, budget: l.budget?.toFixed(2) ?? null,
  channel: l.channel, campaignId: l.campaign?.id ?? null, phones: l.phones,
});
const factsOfEntry = (e: Entry): LeadFacts => ({
  name: e.name, area: e.area, type: e.type, space: e.space ?? null, budget: money(e.budget),
  channel: e.channel, campaignId: e.campaignId ?? null, phones: e.phones,
});

/** One column of the comparison table: the facts, plus the company and the campaign by name. */
const side = (f: LeadFacts, company: string | null, campaign: { id: string; name: string } | null): LeadSide => ({
  name: f.name, company, phones: [...f.phones], area: f.area, type: f.type, space: f.space, budget: f.budget, channel: f.channel, campaign,
});

function toRow(r: DuplicateRecord, e: Entry, person: Map<string, string>, salesperson: Map<string, string>, campaign: Map<string, { id: string; name: string }>): DuplicateRow {
  const l = r.lead;
  return {
    id: r.id, at: r.at.toISOString(), by: { id: r.byUserId, name: person.get(r.byUserId) ?? "" },
    lead: {
      ...side(factsOfLead(l), l.company?.name ?? null, l.campaign), id: l.id, code: l.code,
      assignedTo: l.assignedToId ? { id: l.assignedToId, name: salesperson.get(l.assignedToId) ?? "" } : null,
    },
    entry: side(factsOfEntry(e), e.company ?? null, e.campaignId ? campaign.get(e.campaignId) ?? null : null),
  };
}
