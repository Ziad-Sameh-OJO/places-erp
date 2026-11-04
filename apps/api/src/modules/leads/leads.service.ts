import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { AddComment, ChangeStage, CreateLead, CreatedLead, DuplicateCheck, DuplicateCheckResult, LeadBoard, LeadLogRow, LeadTabCounts, MyCalls, SummaryQuery, LeadDetail, LeadFilters, LeadOptions, LeadRow, LeadSummary, Paged } from "@places/contracts";
import { LEAD_STAGES, type LeadPlacement, type LeadStage, LeadRouter, isQualifiedAfter, placeNewLead, slaView, callGoal, callPeriodStart, firstCallOnTime, canSeeLeadLogs } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { type LeadDetailRecord, type LeadRecord, LeadsRepository } from "./leads.repository";
import { LeadDuplicatesService } from "./duplicates.service";
import { SettingsService } from "../settings/settings.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";

/** Out of scope or gone: the same answer, so it doesn't tell whether the lead exists. */
const NO_LEAD = "الليد ده مش موجود أو مبقاش معاك";
const TELESALES = "telesales"; // role key (seed-data/roles.json)
/** The demo's Kanban shows the newest 30 cards of a lane; its header shows the real count. */
const CARDS_PER_LANE = 30;
const toDb = (s: LeadStage) => s.toUpperCase().replace(/ /g, "_") as never;
/** FOLLOW_UP_TO_VISIT → «Follow up to Visit»: the API speaks the stage names the team uses. */
const STAGE_LABEL = new Map<string, string>(LEAD_STAGES.map((s) => [s.toUpperCase().replace(/ /g, "_"), s]));

/** M-01 use cases. The rules themselves live in @places/domain; this class orchestrates them with the database. */
@Injectable()
export class LeadsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadsRepository,
    private readonly audit: AuditService,
    private readonly duplicates: LeadDuplicatesService,
    private readonly settings: SettingsService,
    private readonly time: BusinessTimeService,
  ) {}

  /** Sales see their own leads, a TL their team's, operations and the sales director all of them (M-01 4). */
  async list(me: CurrentUser, f: LeadFilters): Promise<Paged<LeadRow>> {
    const [rows, total] = await this.repo.list(ownedBy(me) as never, f);
    const [names, sla] = await Promise.all([this.salespeopleNames(rows.map((r) => r.assignedToId)), this.slaClock()]);
    return { items: rows.map((r) => toRow(r, names, sla)), total, page: f.page, pageSize: f.pageSize };
  }

  /** The Kanban, lane by lane, so a lane's count is the real one and older leads aren't left out of it. */
  async board(me: CurrentUser, f: LeadFilters): Promise<LeadBoard> {
    const [counts, rows] = await this.repo.board(ownedBy(me) as never, f, LEAD_STAGES.map(toDb), CARDS_PER_LANE);
    const total = new Map(counts.map((c) => [c.stage as string, c._count._all]));
    const [names, sla] = await Promise.all([this.salespeopleNames(rows.flat().map((r) => r.assignedToId)), this.slaClock()]);
    return { lanes: LEAD_STAGES.map((stage, i) => ({ stage, total: total.get(toDb(stage)) ?? 0, items: rows[i]!.map((r) => toRow(r, names, sla)) })) };
  }

  /** The KPI tiles («كل الليدز» · Fresh · Qualified · No Answer) and the saved views' counts, in the caller's scope. */
  async summary(me: CurrentUser, q: SummaryQuery): Promise<LeadSummary> {
    const now = Date.now(), DAY = 24 * 60 * 60 * 1000;
    const [[total, fresh, qualified, noAnswer, interested, thisWeek, lastWeek], { slaRules }, holidayMode] = await Promise.all([
      this.repo.summary(ownedBy(me) as never, q.kind === "broker" ? "BROKER" : "CLIENT", new Date(now - 7 * DAY), new Date(now - 14 * DAY)),
      this.settings.all(), this.time.isHolidayToday(),
    ]);
    return { total, fresh, qualified, noAnswer, interested, thisWeek, lastWeek, holidayMode, slaRules };
  }

  /** «الليدز» and «البروكرز» with the counts the current filters give (1.28). */
  async tabs(me: CurrentUser, f: LeadFilters): Promise<LeadTabCounts> {
    const counts = new Map((await this.repo.tabCounts(ownedBy(me) as never, f)).map((c) => [c.kind, c._count._all]));
    return { client: counts.get("CLIENT") ?? 0, broker: counts.get("BROKER") ?? 0 };
  }

  /** The filters' choices: campaigns, and the salespeople a person may filter by (a TL their team; sales nobody). */
  async options(me: CurrentUser): Promise<LeadOptions> {
    const scope = me.grants.scope;
    const people = scope === "own" ? Promise.resolve([]) : this.repo.salespeople(scope === "team" ? { id: { in: me.teamIds } } : {});
    const [campaigns, salespeople] = await Promise.all([this.repo.campaigns(), people]);
    return { campaigns, salespeople };
  }

  /** The SLA as the list shows it, with the admin's rules (M-13), the official holidays and today's holiday mode. */
  private async slaClock(now = new Date()): Promise<SlaClock> {
    const [{ slaRules }, calendar, holidayMode] = await Promise.all([this.settings.all(), this.time.calendar(), this.time.isHolidayToday(now)]);
    return (r) => {
      if (!r.assignedAt) return null; // not with a salesperson yet: no clock
      const stage = (STAGE_LABEL.get(r.stage) ?? r.stage) as LeadStage;
      const v = slaView({ stage, touched: r.touched, ownedByTelesales: r.ownedByTelesales, assignedAt: r.assignedAt }, now, { holidayMode, rules: slaRules, calendar });
      return v && { level: v.level, minutesLeft: v.minutesLeft, pct: v.pct };
    };
  }

  /** The lead drawer. A lead outside the caller's scope is a 404, not a 403: it doesn't say the lead exists. */
  async get(me: CurrentUser, id: string): Promise<LeadDetail> {
    const lead = await this.repo.detail(ownedBy(me) as never, id);
    if (!lead) throw new NotFoundException(NO_LEAD);
    const [salespeople, people, sla, { leadLogRoles }] = await Promise.all([
      this.salespeopleNames([lead.assignedToId]),
      this.repo.userNames([...new Set(lead.activities.map((a) => a.byUserId).filter(isId))]),
      this.slaClock(),
      this.settings.all(),
    ]);
    return { ...toDetail(lead, salespeople, new Map(people.map((p) => [p.userId, p.name])), sla), canSeeLogs: canSeeLeadLogs(me.roles, leadLogRoles) };
  }

  /**
   * The «Logs» tab (1.25): everything recorded on the lead — automatic lines, people's comments and the audit
   * trail — newest first, each tagged. Only the admin and the roles the admin picked; the lead must be in scope.
   */
  async logs(me: CurrentUser, id: string): Promise<LeadLogRow[]> {
    if (!canSeeLeadLogs(me.roles, (await this.settings.all()).leadLogRoles)) throw new ForbiddenException("الـ Logs للأدمن والأدوار اللي اختارها بس");
    const lead = await this.repo.detail(ownedBy(me) as never, id);
    if (!lead) throw new NotFoundException(NO_LEAD);
    const audits = await this.repo.auditFor(id);
    const names = new Map((await this.repo.userNames([...new Set([...lead.activities.map((a) => a.byUserId), ...audits.map((a) => a.userId)].filter(isId))])).map((p) => [p.userId, p.name]));
    const by = (userId: string | null) => (userId ? { id: userId, name: names.get(userId) ?? "" } : null);
    const rows: LeadLogRow[] = [
      ...lead.activities.map((a) => ({ id: a.id, source: a.kind === "comment" ? "comment" as const : "auto" as const, text: a.text, by: by(a.byUserId), at: a.at.toISOString() })),
      ...audits.map((a) => ({ id: `audit-${a.id}`, source: "audit" as const, text: auditText(a), by: by(a.userId), at: a.at.toISOString() })),
    ];
    return rows.sort((x, y) => y.at.localeCompare(x.at));
  }

  /** A comment (or a call result) on the Activity tab. It is an action, so it stops the SLA clock (M-01: «من غير أي أكشن»). */
  async addComment(me: CurrentUser, id: string, input: AddComment) {
    await this.db.$transaction(async (tx) => {
      const lead = await this.repo.findInScope(ownedBy(me) as never, id, tx);
      if (!lead) throw new NotFoundException(NO_LEAD);
      const activity = await this.repo.addActivity(tx, id, "comment", input.text, me.id);
      await this.repo.markActed(tx, id, activity.at);
      await this.audit.record({ module: "leads", entity: "LeadActivity", entityId: activity.id, action: "comment", userId: me.id, after: { leadId: id, text: input.text } }, tx);
    });
    return this.get(me, id);
  }

  /** «سجّل مكالمة» (demo): a call is an action, so it stops the SLA clock; the first one is kept for the 30-minute KPI. */
  async logCall(me: CurrentUser, id: string) {
    await this.db.$transaction(async (tx) => {
      const lead = await this.repo.findInScope(ownedBy(me) as never, id, tx);
      if (!lead) throw new NotFoundException();
      const call = await this.repo.addCall(tx, id, me.id);
      await this.repo.addActivity(tx, id, "call", "مكالمة اتسجّلت", me.id);
      await this.repo.markActed(tx, id, call.at);
      await this.repo.markFirstCall(tx, id, call.at);
      await this.audit.record({ module: "leads", entity: "LeadCall", entityId: call.id, action: "call", userId: me.id, after: { leadId: id } }, tx);
    });
    return this.get(me, id);
  }

  /** The person's calls in their KPI period (Telesales today, sales / TLs the last 7 days). */
  async myCalls(me: CurrentUser): Promise<MyCalls> {
    const goal = callGoal(me.roles);
    if (!goal) return { goal: null, count: 0 };
    return { goal, count: await this.repo.countCalls(me.id, callPeriodStart(goal, new Date(), await this.time.calendar())) };
  }

  private async salespeopleNames(ids: Array<string | null>) {
    return new Map((await this.repo.employeeNames([...new Set(ids.filter(isId))])).map((e) => [e.id, e.name]));
  }

  /** While the form is filled: is one of these mobiles already a lead? The id only if the person may open that lead. */
  async checkDuplicate(me: CurrentUser, q: DuplicateCheck): Promise<DuplicateCheckResult> {
    const dup = q.phones.length ? await this.repo.findByPhone(q.phones) : null;
    if (!dup) return { hit: null };
    const visible = await this.repo.findInScope(ownedBy(me) as never, dup.id);
    return { hit: { code: dup.code, leadId: visible ? dup.id : null } };
  }

  /** Create → duplicate check by phone (Q7: Operations decides) → route by area round-robin (Q1–Q3) → audit. */
  async create(me: CurrentUser, input: CreateLead): Promise<CreatedLead> {
    const dup = await this.repo.findByPhone(input.phones);
    if (dup) {
      await this.duplicates.record(me, dup, input);
      throw new ConflictException(`العميل ده موجود (${dup.code}) · اتبعت للأوبريشن تقرر`); // demo wording
    }

    return this.db.$transaction(async (tx) => {
      const routing = await tx.setting.findUnique({ where: { key: "routing" } });
      const state = (routing?.value as { cursor: Record<string, number>; skipTurns: Record<string, number> } | null) ?? { cursor: {}, skipTurns: {} };
      const pools = ((await tx.setting.findUnique({ where: { key: "areaRouting" } }))?.value ?? {}) as Record<string, string[]>;
      const router = new LeadRouter(state);
      const placement = placeNewLead(
        { employeeId: me.employeeId, isTelesales: me.roles.includes(TELESALES), ownScope: me.grants.scope === "own" },
        { assignToId: input.assignToId, keep: input.keep },
      );
      if (placement.kind === "hand") router.assignedByHand(placement.to);
      const assignedToId = placement.kind === "route" ? router.next(input.area, pools[input.area] ?? []) : placement.to;
      await tx.setting.upsert({ where: { key: "routing" }, update: { value: router.snapshot() as never }, create: { key: "routing", value: router.snapshot() as never } });

      const [{ n }] = (await this.repo.nextCode(tx)) as [{ n: bigint }];
      const company = input.company ? await this.repo.companyByName(tx, input.company) : null;
      const lead = await tx.lead.create({
        data: {
          code: `L-${n}`, name: input.name, phones: input.phones, area: input.area, type: input.type, space: input.space ?? null,
          condition: input.condition ?? null, budget: input.budget ?? null, channel: input.channel, campaignId: input.campaignId ?? null,
          assignedToId, assignedAt: assignedToId ? new Date() : null, createdById: me.id,
          ownedByTelesales: placement.kind === "telesales", // stops the SLA clock while it's with her (leadSla)
          kind: input.kind === "broker" ? "BROKER" : "CLIENT", selfEntered: placement.kind === "own", // 1.28 · KPI 11.15
          companyId: company?.id ?? null, note: input.note ?? null,
        },
      });
      await this.repo.addArrival(tx, { leadId: lead.id, channel: lead.channel, campaignId: lead.campaignId, duplicate: false, byUserId: me.id });
      await this.repo.addActivity(tx, lead.id, "assign", await this.createdText(tx, me, placement, assignedToId), me.id);
      if (input.note) await this.repo.addActivity(tx, lead.id, "comment", input.note, me.id);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: lead.id, action: "create", userId: me.id, after: lead }, tx);
      const [to] = assignedToId ? await this.repo.employeeNames([assignedToId], tx) : [];
      return { id: lead.id, code: lead.code, ownedByTelesales: lead.ownedByTelesales, assignedTo: to ?? null };
    });
  }

  /** Stage change: Qualified is sticky (isQualifiedAfter), the SLA clock stops on the first action. */
  async changeStage(me: CurrentUser, id: string, input: ChangeStage) {
    return this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id, ...(ownedBy(me) as object) } });
      if (!lead) throw new NotFoundException(NO_LEAD);
      const next = await tx.lead.update({
        where: { id },
        data: { stage: toDb(input.stage), qualified: isQualifiedAfter(lead.qualified, input.stage), touched: true,
          noAnswerCount: input.stage === "No Answer" ? { increment: 1 } : undefined },
      });
      const activity = await this.repo.addActivity(tx, id, "stage", `المرحلة بقت ${input.stage}${input.note ? ` · ${input.note}` : ""}`, me.id);
      await this.repo.markActed(tx, id, activity.at);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "stage", userId: me.id, before: { stage: lead.stage }, after: { stage: next.stage } }, tx);
      return next;
    });
  }

  /** The first line of the Activity, in the demo's words: who entered the lead and where it went. */
  private async createdText(tx: Prisma.TransactionClient, me: CurrentUser, placement: LeadPlacement, assignedToId: string | null) {
    const by = `اتعمل بواسطة ${me.name}`;
    if (placement.kind === "telesales") return `${by} · فضل عند Telesales`;
    if (placement.kind === "own") return `${by} · فضل عنده (هو اللي دخّله)`;
    if (!assignedToId) return by; // nobody covers the area yet: Operations assigns it by hand
    const [salesperson] = await this.repo.employeeNames([assignedToId], tx);
    return `${by} · اتوزع لـ ${salesperson?.name ?? ""}`;
  }
}

const isId = (x: string | null): x is string => !!x;

/** An audit entry as one readable line of the Logs tab. */
function auditText(a: { entity: string; action: string; before: unknown; after: unknown }): string {
  const field = (v: unknown, k: string) => (v && typeof v === "object" && k in v ? String((v as Record<string, unknown>)[k]) : "");
  const stage = (v: unknown) => STAGE_LABEL.get(field(v, "stage")) ?? field(v, "stage");
  switch (`${a.entity}:${a.action}`) {
    case "Lead:create": return "اتعمل الليد";
    case "Lead:stage": return `المرحلة اتغيرت من ${stage(a.before)} لـ ${stage(a.after)}`; // words, not an arrow: RTL flips «←» between two English names
    case "Lead:duplicate-decision": return "قرار الأوبريشن في التكرار";
    case "LeadActivity:comment": return `كومنت: ${field(a.after, "text")}`;
    case "LeadCall:call": return "مكالمة اتسجّلت";
    case "LeadDuplicate:create": return "حد دخّل العميل ده تاني · طلب تكرار للأوبريشن";
    default: return `${a.entity} · ${a.action}`;
  }
}
const iso = (d: Date | null) => d?.toISOString() ?? null;

type SlaClock = (r: Pick<LeadRecord, "stage" | "touched" | "ownedByTelesales" | "assignedAt">) => LeadRow["sla"];

function toRow({ assignedToId, budget, kind, ...r }: LeadRecord, names: Map<string, string>, sla: SlaClock): LeadRow {
  return {
    ...r, kind: kind === "BROKER" ? "broker" : "client", budget: budget?.toFixed(2) ?? null, // money on the wire is a decimal string
    stage: STAGE_LABEL.get(r.stage) ?? r.stage, sla: sla(r),
    assignedTo: assignedToId ? { id: assignedToId, name: names.get(assignedToId) ?? "" } : null,
    assignedAt: iso(r.assignedAt), arrivedAt: r.arrivedAt.toISOString(), createdAt: r.createdAt.toISOString(),
  };
}

function toDetail(lead: LeadDetailRecord, salespeople: Map<string, string>, people: Map<string, string>, sla: SlaClock): Omit<LeadDetail, "canSeeLogs"> {
  const { activities, company, firstActionAt, firstCallAt, condition, note, post, noAnswerCount, rotation, ...row } = lead;
  return {
    ...toRow(row, salespeople, sla), condition, note, post, noAnswerCount, rotation,
    company: company?.name ?? null, firstActionAt: iso(firstActionAt),
    firstCallAt: iso(firstCallAt), firstCallOnTime: firstCallOnTime(row.arrivedAt, firstCallAt),
    activities: activities.map(({ byUserId, at, ...a }) => ({
      ...a, at: at.toISOString(), by: byUserId ? { id: byUserId, name: people.get(byUserId) ?? "" } : null,
    })),
  };
}
