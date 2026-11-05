import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { RecommendAnswers, activeValues, type Recommendations, type UnitListInput } from "@places/contracts";
import type { VisitInput, VisitOutcome, VisitRow, AddComment, AssignLead, ChangeStage, CreateLead, CreatedLead, DuplicateCheck, DuplicateCheckResult, LeadBoard, LeadLogRow, LogRoles, LeadTabCounts, MyCalls, SummaryQuery, LeadDetail, LeadFilters, LeadOptions, LeadRow, LeadSummary, Paged } from "@places/contracts";
import { LEAD_STAGES, type VisitKind, visitStage, type LeadPlacement, type LeadStage, LeadRouter, isQualifiedAfter, placeNewLead, slaView, slaRulesOf, ruleRecipients, callGoal, callPeriodStart, firstCallOnTime, canSeeLeadLogs, localDate, routingForDay, ruleHas, fromDecimal, type ClientNeed } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { type LeadDetailRecord, type LeadRecord, LeadsRepository } from "./leads.repository";
import { LeadDuplicatesService } from "./duplicates.service";
import { LeadRulesService } from "./lead-rules.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import { InventoryService } from "../inventory/inventory.service";
import { DocumentsService } from "../../core/documents/documents.service";
import { unitListHtml, unitListLine } from "./unit-list";
import { LeavesService } from "../hr/leaves.service";
import { AttendanceService } from "../hr/attendance.service";
import { RotationService } from "./rotation.service";
import { ClientsService } from "../clients/clients.service";

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
    private readonly rules: LeadRulesService,
    private readonly notifications: NotificationsService,
    private readonly inventory: InventoryService,
    private readonly documents: DocumentsService,
    private readonly leaves: LeavesService,
    private readonly attendance: AttendanceService, // 7.3: a marked Visit re-reads that day
    private readonly rotation: RotationService, // 1.23: today's order
    private readonly clients: ClientsService, // M-10: Done Deal makes the client's file; an old client's number joins it
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
    const [[total, fresh, qualified, noAnswer, interested, thisWeek, lastWeek], rules, holidayMode] = await Promise.all([
      this.repo.summary(ownedBy(me) as never, q.kind === "broker" ? "BROKER" : "CLIENT", new Date(now - 7 * DAY), new Date(now - 14 * DAY)),
      this.rules.get(), this.time.isHolidayToday(),
    ]);
    return { total, fresh, qualified, noAnswer, interested, thisWeek, lastWeek, holidayMode, slaRules: slaRulesOf(rules), slaOn: rules.sla.on };
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
    const [campaigns, salespeople, assignable] = await Promise.all([
      this.repo.campaigns(), people, me.grants.can("leads", "approve") ? this.repo.routingPeople() : Promise.resolve([]),
    ]);
    return { campaigns, salespeople, assignable };
  }

  /** The SLA as the list shows it, with «قواعد الليدز» (1.29: its times, its working hours) and the official holidays. */
  async slaClock(now = new Date()): Promise<SlaClock> {
    const [rules, calendar, holidayMode] = await Promise.all([this.rules.get(), this.time.calendar(), this.time.isHolidayToday(now)]);
    const slaRules = slaRulesOf(rules);
    return (r) => {
      if (!r.assignedAt || !rules.sla.on) return null; // not with a salesperson yet, or the SLA rule is switched off: no clock
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
    const canSeeLogs = canSeeLeadLogs(me.roles, leadLogRoles);
    // the same lines the Logs tab lists: the lead's own records plus its audit trail
    const logCount = canSeeLogs ? lead.activities.length + (await this.repo.auditCount(id)) : null;
    const detail = toDetail(lead, salespeople, new Map(people.map((p) => [p.userId, p.name])), sla);
    // 1.24: «وافق على التأجيل» only for whom the lead rules name (the salesperson's TL by default)
    if (lead.assignedToId && detail.visits.some((v) => v.postpone?.status === "pending") && (await this.canDecidePostpone(me, lead.assignedToId))) for (const v of detail.visits) if (v.postpone) v.postpone.canDecide = v.postpone.status === "pending";
    return { ...detail, canSeeLogs, logCount };
  }

  /** 1.24: whether this person approves postponing this salesperson's Visits (lead rules «visit.postpone»). */
  async canDecidePostpone(me: CurrentUser, ownerId: string) {
    const [rules, owner] = await Promise.all([this.rules.get(), this.repo.ownerAccounts(ownerId)]);
    return !!owner && ruleHas(rules.visit.postpone, { ownerUserId: owner.userId, ownerTlUserId: owner.teamLeader?.userId ?? null }, me);
  }

  /** «مين يشوف الـ Logs» from the lead's Logs tab (demo): whoever manages access picks the roles; audited under «access». */
  async setLogRoles(me: CurrentUser, input: LogRoles) {
    return { roles: await this.settings.set(me, "leadLogRoles", input.roles, "access") };
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

  /**
   * The lead's «الوحدات» tab (2.12, M-03 3.2 · 7.1): the units that suit the client, narrowed by the answers kept on
   * the lead, with the ± tolerance from the settings (proposed ±20%, needs-client).
   */
  async recommendations(me: CurrentUser, id: string): Promise<Recommendations> {
    const lead = await this.repo.clientNeed(ownedBy(me) as never, id);
    if (!lead) throw new NotFoundException(NO_LEAD);
    const settings = await this.settings.all();
    const answers = storedAnswers(lead.answers);
    const need = needOf(lead);
    const { items, projects } = await this.inventory.recommend(need, answers, settings.recommendTolerancePct);
    return {
      tolerancePct: settings.recommendTolerancePct,
      client: { type: lead.type, space: lead.space, condition: lead.condition, budget: lead.budget?.toFixed(2) ?? null, area: lead.area },
      answers, projects, paymentMethods: activeValues(settings.paymentPlans), items,
    };
  }

  /** The narrowing answers are part of the lead (M-03 3.2: «إجاباتها تتسجّل على الليد»): saved and audited. */
  async setAnswers(me: CurrentUser, id: string, answers: RecommendAnswers): Promise<Recommendations> {
    await this.db.$transaction(async (tx) => {
      const lead = await this.repo.clientNeed(ownedBy(me) as never, id, tx);
      if (!lead) throw new NotFoundException(NO_LEAD);
      const before = storedAnswers(lead.answers);
      await this.repo.setAnswers(tx, id, answers as Prisma.InputJsonValue);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "answers", userId: me.id, before, after: answers }, tx);
    });
    return this.recommendations(me, id);
  }

  /**
   * «ابعت للعميل وسجّل كومنت» (2.13, M-01 6.1 · M-03 6.1): the PDF «List of options» of the picked units, and a comment
   * on the lead with each unit's project and space. The PDF is made first, so a failed render records nothing; the
   * units are kept as the lead's suggested units. It is an action on the lead (stops the SLA clock).
   */
  async sendUnitList(me: CurrentUser, id: string, input: UnitListInput): Promise<{ name: string; pdf: Buffer }> {
    const lead = await this.repo.clientNeed(ownedBy(me) as never, id);
    if (!lead) throw new NotFoundException(NO_LEAD);
    const found = await this.inventory.forClientList(input.unitIds);
    if (!found) throw new BadRequestException("فيه وحدة مش متاحة · اختار من الـ Recommendations");
    // a big divisible unit suggested in part (Q20) goes on the list with the client's space and its price for it
    const { recommendTolerancePct } = await this.settings.all();
    const need = needOf(lead);
    const parts = new Map((await this.inventory.recommend(need, {}, recommendTolerancePct)).items.filter((r) => r.split).map((r) => [r.id, r]));
    const units = found.map((u) => { const p = parts.get(u.id); return p && need.space ? { ...u, space: need.space, splitOf: u.space, totalPrice: p.price } : u; });
    const now = new Date();
    const pdf = await this.documents.pdf(unitListHtml(lead.name, units, now), now);
    await this.db.$transaction(async (tx) => {
      if (!(await this.repo.findInScope(ownedBy(me) as never, id, tx))) throw new NotFoundException(NO_LEAD);
      const text = unitListLine(units);
      const activity = await this.repo.addActivity(tx, id, "comment", text, me.id);
      await this.repo.markActed(tx, id, activity.at);
      await this.repo.addSuggestedUnits(tx, id, units.map((u) => u.id), me.id);
      await this.audit.record({ module: "leads", entity: "LeadActivity", entityId: activity.id, action: "unit-list", userId: me.id,
        after: { leadId: id, unitIds: input.unitIds, text } }, tx);
    });
    return { name: `List of options · ${lead.name}.pdf`, pdf };
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

    const created = await this.db.$transaction(async (tx) => {
      const state = routingForDay(await this.repo.lockRouting(tx), localDate(new Date())); // first: leads created at the same moment take their turns one after the other
      const pools = ((await tx.setting.findUnique({ where: { key: "areaRouting" } }))?.value ?? {}) as Record<string, string[]>;
      const router = new LeadRouter(state);
      const placement = placeNewLead(
        { employeeId: me.employeeId, isTelesales: me.roles.includes(TELESALES), ownScope: me.grants.scope === "own" },
        { assignToId: input.assignToId, keep: input.keep },
      );
      if (placement.kind === "hand") router.assignedByHand(placement.to);
      // the area's rotation, without anyone whose account was switched off since they were ticked (1.13) or who is on approved leave today (1.15, M-05 6.2)
      const onLeave = placement.kind === "route" ? await this.leaves.employeesOnLeave(localDate(new Date()), tx) : new Set<string>();
      const assignedToId = placement.kind === "route" ? router.next(input.area, await this.rotation.order((await this.repo.stillWorking(pools[input.area] ?? [], tx)).filter((id) => !onLeave.has(id)), tx)) : placement.to;
      await this.repo.saveRouting(tx, router.snapshot());

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
          clientId: await this.clients.fileOf(tx, input.phones), // M-10 2.3: a returning client's lead joins their file
        },
      });
      await this.repo.addArrival(tx, { leadId: lead.id, channel: lead.channel, campaignId: lead.campaignId, duplicate: false, byUserId: me.id });
      await this.repo.addActivity(tx, lead.id, "assign", await this.createdText(tx, me, placement, assignedToId), me.id);
      if (input.note) await this.repo.addActivity(tx, lead.id, "comment", input.note, me.id);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: lead.id, action: "create", userId: me.id, after: lead }, tx);
      const [to] = assignedToId ? await this.repo.employeeNames([assignedToId], tx) : [];
      return { id: lead.id, code: lead.code, ownedByTelesales: lead.ownedByTelesales, assignedTo: to ?? null, placement: placement.kind, name: lead.name, area: lead.area };
    });
    // «ليد جديد اتوزع» (1.29 rules, default: the salesperson and the Team Leaders): a lead that went to someone by
    // the rotation or by Operations' hand — not one Telesales keeps or a salesperson entered for themselves (demo)
    if (created.assignedTo && (created.placement === "route" || created.placement === "hand")) await this.notifyAssigned(created.id, created.name, created.area, created.assignedTo.id);
    return { id: created.id, code: created.code, ownedByTelesales: created.ownedByTelesales, assignedTo: created.assignedTo };
  }

  /** The lead rules' «ليد جديد اتوزع» for one lead and the salesperson it went to. */
  private async notifyAssigned(leadId: string, name: string, area: string, employeeId: string) {
    const [rules, owner] = await Promise.all([this.rules.get(), this.repo.ownerAccounts(employeeId)]);
    if (!owner) return;
    const to = ruleRecipients(rules.newLead, { ownerUserId: owner.userId, ownerTlUserId: owner.teamLeader?.userId ?? null });
    await this.notifications.notify({ event: "lead.assigned", text: `ليد جديد ${name} راح لـ ${owner.name} (${area})`, link: `/leads?open=${leadId}`, to, channels: [...rules.newLead.ch] });
  }

  /**
   * «اسحب الليد وحوّله» (1.14, M-01 Q2 · 4.1): the lead goes to the chosen salesperson with a fresh SLA clock, and
   * that salesperson skips their next turn in the rotation («يتحسبله كأنه أخد دوره»). Audited from whom to whom;
   * the new salesperson is told on the channels of the lead rules' «ليد جديد اتوزع».
   */
  async assign(me: CurrentUser, id: string, input: AssignLead) {
    const to = (await this.repo.routingPeople()).find((p) => p.id === input.to);
    if (!to) throw new BadRequestException("اختار سيلز من القايمة");
    const moved = await this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { AND: [ownedBy(me) as never, { id, archivedAt: null }] }, select: { id: true, name: true, assignedToId: true } });
      if (!lead) throw new NotFoundException(NO_LEAD);
      if (lead.assignedToId === to.id) throw new BadRequestException(`الليد مع ${to.name} بالفعل`);
      const [from] = lead.assignedToId ? await this.repo.employeeNames([lead.assignedToId], tx) : [];
      const router = new LeadRouter(await this.repo.lockRouting(tx));
      router.assignedByHand(to.id);
      await this.repo.saveRouting(tx, router.snapshot());
      await tx.lead.update({
        where: { id },
        // a fresh start with the new salesperson: the SLA counts from now (demo: assignedAt, touched, alerted)
        data: { assignedToId: to.id, assignedAt: new Date(), ownedByTelesales: false, touched: false, firstActionAt: null, slaWarnedAt: null },
      });
      const text = from ? `اتسحب يدوي من ${from.name} واتحوّل لـ ${to.name}` : `اتحوّل يدوي لـ ${to.name}`;
      await this.repo.addActivity(tx, id, "assign", text, me.id);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "reassign", userId: me.id,
        before: { assignedToId: lead.assignedToId, name: from?.name ?? null }, after: { assignedToId: to.id, name: to.name } }, tx);
      return { name: lead.name, from: from?.name ?? null };
    });
    const [rules, owner] = await Promise.all([this.rules.get(), this.repo.ownerAccounts(to.id)]);
    if (owner) {
      await this.notifications.notify({ event: "lead.assigned", text: moved.from ? `ليد ${moved.name} اتحوّلك من ${moved.from}` : `ليد ${moved.name} اتحوّلك`,
        link: `/leads?open=${id}`, to: [owner.userId], channels: [...rules.newLead.ch] });
    }
    return this.get(me, id);
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
      if (input.stage === "Done Deal") await this.clientFile(tx, me, id);
      return next;
    });
  }

  /** «سجّل صفقة» (M-02 2.1 step 1): the caller's leads that were ever Interested; one of them when `id` is given. */
  dealLeads(me: CurrentUser, id?: string) {
    return this.repo.dealLeads(ownedBy(me) as never, id);
  }

  /** A deal was registered on the lead (M-02): it moves to Done Deal in the deal's own transaction, with a line in its Activity. */
  async markDoneDeal(tx: Prisma.TransactionClient, me: CurrentUser, lead: { id: string; stage: string; qualified: boolean }, text: string) {
    await this.repo.addActivity(tx, lead.id, "stage", text, me.id);
    if (lead.stage !== toDb("Done Deal")) await this.moveStage(tx, me, lead.id, lead, "Done Deal");
    await this.clientFile(tx, me, lead.id);
  }

  /** M-10 2.1: the client's file is made (or found by number) with the Done Deal, in the same transaction. */
  private async clientFile(tx: Prisma.TransactionClient, me: CurrentUser, id: string) {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id }, select: { name: true, phones: true, company: { select: { name: true } } } });
    await this.clients.joinAsClient(tx, me.id, { id, name: lead.name, phones: lead.phones, company: lead.company?.name ?? null });
  }

  /** The Visit form's unit search (1.9): through the inventory's own rule of what a salesperson may see. */
  visitUnits(q?: string) {
    return this.inventory.forVisit(q);
  }

  /**
   * «Visit / Meeting جديدة» (1.9, M-01 3.3): the time, units from the inventory and spaces not in the sheet. It is an
   * action on the lead (stops the SLA clock) and moves it to «Follow up to Visit / Meeting», forward only (visitStage).
   */
  async addVisit(me: CurrentUser, id: string, input: VisitInput) {
    const units = await this.visitUnitCodes(input.unitIds, []);
    await this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { AND: [ownedBy(me) as never, { id, archivedAt: null }] }, select: { stage: true, qualified: true } });
      if (!lead) throw new NotFoundException(NO_LEAD);
      const at = new Date(input.at);
      const visit = await this.repo.addVisit(tx, id, { kind: input.kind.toLowerCase(), at, extra: input.extra ?? null, unitIds: input.unitIds }, me.id);
      const activity = await this.repo.addActivity(tx, id, input.kind === "Meeting" ? "meeting" : "visit", visitText(input, at, units), me.id);
      await this.repo.markActed(tx, id, activity.at);
      await this.audit.record({ module: "leads", entity: "LeadVisit", entityId: visit.id, action: "create", userId: me.id,
        after: { leadId: id, kind: input.kind, at: input.at, unitIds: input.unitIds, extra: input.extra ?? null } }, tx);
      await this.moveStage(tx, me, id, lead, visitStage(stageOf(lead.stage), input.kind, "booked"));
    });
    return this.get(me, id);
  }

  /** «تعديل» (demo): while the Visit isn't marked yet. A new time brings a new Alarm. */
  async editVisit(me: CurrentUser, id: string, visitId: string, input: VisitInput) {
    await this.db.$transaction(async (tx) => {
      if (!(await this.repo.findInScope(ownedBy(me) as never, id, tx))) throw new NotFoundException(NO_LEAD);
      const before = await this.repo.findVisit(tx, id, visitId);
      if (!before) throw new NotFoundException(NO_VISIT);
      if (before.outcome) throw new BadRequestException("الميعاد اتعلّم خلاص · مينفعش يتعدّل");
      const kept = before.units.map((u) => u.unitId);
      const units = await this.visitUnitCodes(input.unitIds, kept);
      const at = new Date(input.at);
      await this.repo.updateVisit(tx, visitId, { kind: input.kind.toLowerCase(), at, extra: input.extra ?? null, unitIds: input.unitIds }, at.getTime() !== before.at.getTime());
      await this.repo.addActivity(tx, id, input.kind === "Meeting" ? "meeting" : "visit", `اتعدّل الـ ${visitText(input, at, units)}`, me.id);
      await this.audit.record({ module: "leads", entity: "LeadVisit", entityId: visitId, action: "update", userId: me.id,
        before: { leadId: id, kind: kindOf(before.kind), at: before.at.toISOString(), unitIds: kept, extra: before.extra },
        after: { leadId: id, kind: input.kind, at: input.at, unitIds: input.unitIds, extra: input.extra ?? null } }, tx);
    });
    return this.get(me, id);
  }

  /**
   * «Done» moves the lead to Visit / Meeting (forward only) and counts in the salesperson's activity (KPI Showings);
   * «معملتهاش» shows for HR (M-05 Q28) and tells whom «قواعد الليدز» names (visit.notDone, default the HR).
   */
  async markVisit(me: CurrentUser, id: string, visitId: string, input: VisitOutcome) {
    const marked = await this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { AND: [ownedBy(me) as never, { id, archivedAt: null }] }, select: { name: true, stage: true, qualified: true, assignedToId: true } });
      if (!lead) throw new NotFoundException(NO_LEAD);
      const visit = await this.repo.findVisit(tx, id, visitId);
      if (!visit) throw new NotFoundException(NO_VISIT);
      if (visit.postponeStatus === "pending" || visit.postponeStatus === "approved") throw new BadRequestException("الميعاد ده عليه تأجيل");
      if (!(await this.repo.markVisit(tx, visitId, input.outcome)).count) throw new BadRequestException("الميعاد اتعلّم خلاص");
      if (lead.assignedToId) await this.attendance.refreshDay(lead.assignedToId, visit.at, tx); // 7.3: Done = the day starts at the Visit
      const kind = kindOf(visit.kind);
      await this.repo.addActivity(tx, id, kind === "Meeting" ? "meeting" : "visit",
        input.outcome === "done" ? `الـ ${kind} خلصت · اتحسبت في الـ activity` : `الـ ${kind} اتعلّمت إنها محصلتش`, me.id);
      await this.audit.record({ module: "leads", entity: "LeadVisit", entityId: visitId, action: input.outcome === "done" ? "done" : "not-done", userId: me.id,
        before: { leadId: id, outcome: null }, after: { leadId: id, outcome: input.outcome } }, tx);
      if (input.outcome === "done") await this.moveStage(tx, me, id, lead, visitStage(stageOf(lead.stage), kind, "done"));
      return { kind, at: visit.at, name: lead.name, ownerId: lead.assignedToId };
    });
    if (input.outcome === "not_done" && marked.ownerId) {
      const [rules, owner] = await Promise.all([this.rules.get(), this.repo.ownerAccounts(marked.ownerId)]);
      if (owner) {
        const to = ruleRecipients(rules.visit.notDone, { ownerUserId: owner.userId, ownerTlUserId: owner.teamLeader?.userId ?? null });
        await this.notifications.notify({ event: "lead.visit_not_done", text: `${owner.name}: ${marked.kind} ${cairo(marked.at)} مع ${marked.name} اتعلّمت إنها محصلتش`,
          link: `/leads?open=${id}`, to, channels: [...rules.visit.notDone.ch] });
      }
    }
    return this.get(me, id);
  }

  /** The automatic stage move of a Visit / Meeting, recorded like the demo («المرحلة اتنقلت لوحدها لـ …») and audited. */
  private async moveStage(tx: Prisma.TransactionClient, me: CurrentUser, id: string, lead: { stage: string; qualified: boolean }, to: LeadStage | null) {
    if (!to) return;
    await this.repo.setStage(tx, id, toDb(to), isQualifiedAfter(lead.qualified, to));
    await this.repo.addActivity(tx, id, "stage", `المرحلة اتنقلت لوحدها لـ ${to}`, null);
    await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "stage", userId: me.id, before: { stage: lead.stage }, after: { stage: toDb(to) } }, tx);
  }

  /** The picked units' codes. New picks must be open units a salesperson may see; ones already on the visit may stay. */
  private async visitUnitCodes(ids: string[], kept: string[]) {
    const fresh = ids.filter((u) => !kept.includes(u));
    const open = await this.inventory.openForVisit(fresh);
    if (fresh.some((u) => !open.has(u))) throw new BadRequestException("فيه وحدة مش متاحة · اختار من القايمة");
    return new Map((await this.inventory.codes(ids)).map((u) => [u.id, u.code]));
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
const NO_VISIT = "الميعاد ده مش موجود";
const stageOf = (db: string) => (STAGE_LABEL.get(db) ?? db) as LeadStage;
const kindOf = (db: string): VisitKind => (db === "meeting" ? "Meeting" : "Visit");
/** A time as the Activity writes it, in Cairo. */
const cairo = (d: Date) => d.toLocaleString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" });
/** Demo: «Visit 5 نوف 11:30 على: U-101، U-102 · دور 4 في مبنى B6». */
const visitText = (v: VisitInput, at: Date, codes: Map<string, string>) =>
  `${v.kind} ${cairo(at)} على: ${v.unitIds.map((u) => codes.get(u)).join("، ") || "—"}${v.extra ? ` · ${v.extra}` : ""}`;

/** An audit entry as one readable line of the Logs tab. */
function auditText(a: { entity: string; action: string; before: unknown; after: unknown }): string {
  const field = (v: unknown, k: string) => (v && typeof v === "object" && k in v ? String((v as Record<string, unknown>)[k]) : "");
  const stage = (v: unknown) => STAGE_LABEL.get(field(v, "stage")) ?? field(v, "stage");
  switch (`${a.entity}:${a.action}`) {
    case "Lead:create": return "اتعمل الليد";
    case "Lead:stage": return `المرحلة اتغيرت من ${stage(a.before)} لـ ${stage(a.after)}`; // words, not an arrow: RTL flips «←» between two English names
    case "Lead:duplicate-decision": return "قرار الأوبريشن في التكرار";
    case "Lead:reassign": return field(a.before, "name") && field(a.before, "name") !== "null" ? `اتسحب يدوي من ${field(a.before, "name")} لـ ${field(a.after, "name")}` : `اتحوّل يدوي لـ ${field(a.after, "name")}`;
    case "LeadActivity:comment": return `كومنت: ${field(a.after, "text")}`;
    case "LeadCall:call": return "مكالمة اتسجّلت";
    case "LeadVisit:create": return `اتحدد ${field(a.after, "kind")}`;
    case "LeadVisit:update": return `اتعدّل ميعاد الـ ${field(a.after, "kind")}`;
    case "LeadVisit:done": return "الميعاد اتعلّم Done";
    case "LeadVisit:not-done": return "الميعاد اتعلّم «معملتهاش»";
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

function toDetail(lead: LeadDetailRecord, salespeople: Map<string, string>, people: Map<string, string>, sla: SlaClock): Omit<LeadDetail, "canSeeLogs" | "logCount"> {
  const { activities, visits, company, firstActionAt, firstCallAt, condition, note, post, noAnswerCount, rotation, ...row } = lead;
  const now = Date.now();
  return {
    ...toRow(row, salespeople, sla), condition, note, post, noAnswerCount, rotation,
    company: company?.name ?? null, firstActionAt: iso(firstActionAt),
    firstCallAt: iso(firstCallAt), firstCallOnTime: firstCallOnTime(row.arrivedAt, firstCallAt),
    activities: activities.map(({ byUserId, at, ...a }) => ({
      ...a, at: at.toISOString(), by: byUserId ? { id: byUserId, name: people.get(byUserId) ?? "" } : null,
    })),
    visits: visits.map((v): VisitRow => ({
      id: v.id, kind: kindOf(v.kind), at: v.at.toISOString(), extra: v.extra, outcome: v.outcome === "done" || v.outcome === "not_done" ? v.outcome : null,
      due: !v.outcome && v.postponeStatus !== "pending" && v.postponeStatus !== "approved" && v.at.getTime() <= now, units: v.units.map((u) => u.unit),
      postpone: v.postponeStatus === "pending" || v.postponeStatus === "approved" || v.postponeStatus === "rejected" ? { status: v.postponeStatus, reason: v.postponeReason ?? "", canDecide: false } : null,
    })),
  };
}

/** The answers kept on the lead; anything unreadable counts as unanswered. */
function storedAnswers(v: unknown): RecommendAnswers {
  const parsed = RecommendAnswers.safeParse(v ?? {});
  return parsed.success ? parsed.data : {};
}

/** What the lead says the client wants, for the recommendations (M-03 3.2). */
function needOf(lead: { type: string; space: number | null; condition: string | null; budget: Prisma.Decimal | null; area: string }): ClientNeed {
  return { type: lead.type, space: lead.space, condition: lead.condition, budget: lead.budget ? fromDecimal(lead.budget.toFixed(2)) : null, area: lead.area };
}
