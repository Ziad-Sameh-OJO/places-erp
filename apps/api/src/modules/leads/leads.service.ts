import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { RecommendAnswers, activeValues, type Recommendations, type UnitListInput } from "@places/contracts";
import type { LeadBatch, LeadBatchResult, UpdateLead, VisitInput, VisitOutcome, VisitRow, AddComment, AssignLead, ChangeStage, CreateLead, CreatedLead, DuplicateCheck, DuplicateCheckResult, LeadBoard, LeadLogRow, LogRoles, LeadTabCounts, MyCalls, SummaryQuery, LeadDetail, LeadFilters, LeadOptions, LeadRow, LeadSummary, Paged } from "@places/contracts";
import { LEAD_STAGES, type VisitKind, visitStage, type LeadPlacement, type LeadStage, LeadRouter, isQualifiedAfter, placeNewLead, slaView, slaRulesOf, ruleRecipients, callGoal, callPeriodStart, firstCallOnTime, canSeeLeadLogs, ruleHas, fromDecimal, type ClientNeed, isNamedIn, goesToDraftAdmin, draftAdminAlarm, type LeadRules, changes, toDecimal } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { EXPORT_LIMIT } from "../../core/http/excel";
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
import { hideClient, hideLeadDetail, hideLeadRow, hideListUnit, hideRecommended, keepFixedCreate, keepFixedUpdate, shownAnswers, shownLeadFilters } from "./lead-fields";
import { CompaniesService } from "./companies.service";
import { AttendanceService } from "../hr/attendance.service";
import { ClientsService } from "../clients/clients.service";

/** Out of scope or gone: the same answer, so it doesn't tell whether the lead exists. */
const NO_LEAD = "الليد ده مش موجود أو مبقاش معاك";
const openOf = (employeeId: string): Prisma.LeadWhereInput => ({ assignedToId: employeeId, archivedAt: null, stage: { notIn: ["DONE_DEAL", "NOT_INTERESTED", "CANCELLATION"] } });
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
    private readonly companies: CompaniesService,
    private readonly attendance: AttendanceService, // 7.3: a marked Visit re-reads that day
    private readonly clients: ClientsService, // M-10: Done Deal makes the client's file; an old client's number joins it
  ) {}

  /** Sales see their own leads, a TL their team's, operations and the sales director all of them (M-01 4). */
  async list(me: CurrentUser, f: LeadFilters): Promise<Paged<LeadRow>> {
    const hidden = me.fields.hidden("leads");
    const [rows, total] = await this.repo.list(ownedBy(me) as never, shownLeadFilters(f, hidden));
    const [names, sla] = await Promise.all([this.salespeopleNames(rows.map((r) => r.assignedToId)), this.slaClock()]);
    return { items: rows.map((r) => hideLeadRow(toRow(r, names, sla), hidden)), total, page: f.page, pageSize: f.pageSize };
  }

  /** The Kanban, lane by lane, so a lane's count is the real one and older leads aren't left out of it. */
  async board(me: CurrentUser, f: LeadFilters): Promise<LeadBoard> {
    const hidden = me.fields.hidden("leads");
    const [counts, rows] = await this.repo.board(ownedBy(me) as never, shownLeadFilters(f, hidden), LEAD_STAGES.map(toDb), CARDS_PER_LANE);
    const total = new Map(counts.map((c) => [c.stage as string, c._count._all]));
    const [names, sla] = await Promise.all([this.salespeopleNames(rows.flat().map((r) => r.assignedToId)), this.slaClock()]);
    return { lanes: LEAD_STAGES.map((stage, i) => ({ stage, total: total.get(toDb(stage)) ?? 0, items: rows[i]!.map((r) => hideLeadRow(toRow(r, names, sla), hidden)) })) };
  }

  /** The KPI tiles («كل الليدز» · Fresh · Qualified · No Answer) and the saved views' counts, in the caller's scope. */
  async summary(me: CurrentUser, q: SummaryQuery): Promise<LeadSummary> {
    const now = Date.now(), DAY = 24 * 60 * 60 * 1000;
    const [[total, fresh, qualified, noAnswer, interested, thisWeek, lastWeek], rules, holidayMode] = await Promise.all([
      this.repo.summary(ownedBy(me) as never, q.kind === "broker" ? "BROKER" : "CLIENT", new Date(now - 7 * DAY), new Date(now - 14 * DAY)),
      this.rules.get(), this.time.isHolidayToday(),
    ]);
    return { total, fresh, qualified, noAnswer, interested, thisWeek, lastWeek, holidayMode, slaRules: slaRulesOf(rules), slaOn: rules.sla.on,
      noAnswerRules: { hours: rules.noAnswer.hours, remindH: rules.noAnswer.remindH },
      drafts: isNamedIn(rules.draft.see, { userId: me.id, roles: me.roles }) ? await this.repo.openDrafts("draft") : null,
      draftRules: { days: rules.draft.days, holdDays: rules.draft.holdDays },
      draftAdmin: isNamedIn(rules.draftAdmin.see, { userId: me.id, roles: me.roles }) ? await this.draftAdminCounts() : null };
  }

  /** The Draft Admin tab's count and its Alarm (demo: «Alarm: n Not Interested / Cancellation مستنيين قرارك · m النهارده»). */
  private async draftAdminCounts() {
    const [total, waiting] = await Promise.all([this.repo.openDrafts("admin"), this.repo.draftAdminWaiting()]);
    const alarm = draftAdminAlarm(waiting, new Date());
    return { total, waiting: alarm?.waiting ?? 0, today: alarm?.today ?? 0 };
  }

  /** «الليدز» and «البروكرز» with the counts the current filters give (1.28). */
  async tabs(me: CurrentUser, f: LeadFilters): Promise<LeadTabCounts> {
    const counts = new Map((await this.repo.tabCounts(ownedBy(me) as never, shownLeadFilters(f, me.fields.hidden("leads")))).map((c) => [c.kind, c._count._all]));
    return { client: counts.get("CLIENT") ?? 0, broker: counts.get("BROKER") ?? 0 };
  }

  /** The filters' choices: campaigns, and the salespeople a person may filter by (a TL their team; sales nobody). */
  async options(me: CurrentUser): Promise<LeadOptions> {
    const scope = me.grants.scope;
    const people = scope === "own" ? Promise.resolve([]) : this.repo.salespeople(scope === "team" ? { id: { in: me.teamIds } } : {});
    const [campaigns, holders, assignable] = await Promise.all([
      this.repo.campaigns(), people, me.grants.can("leads", "approve") ? this.repo.routingPeople() : Promise.resolve([]),
    ]);
    // demo leads.js «Sales» filter: the salespeople, then Telesales as «<name> (Telesales)»
    const tele = (p: { roles: string[] }) => p.roles.includes(TELESALES) && !p.roles.some((r) => r === "sales" || r === "tl");
    const salespeople = [...holders.filter((p) => !tele(p)), ...holders.filter(tele).map((p) => ({ ...p, name: `${p.name} (Telesales)` }))]
      .map(({ id, name }) => ({ id, name }));
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
    const detail = toDetail(lead, salespeople, new Map(people.map((p) => [p.userId, p.name])), sla, me.fields.hidden("inventory"));
    // 1.24: «وافق على التأجيل» only for whom the lead rules name (the salesperson's TL by default)
    if (lead.assignedToId && detail.visits.some((v) => v.postpone?.status === "pending") && (await this.canDecidePostpone(me, lead.assignedToId))) for (const v of detail.visits) if (v.postpone) v.postpone.canDecide = v.postpone.status === "pending";
    return { ...hideLeadDetail(detail, me.fields.hidden("leads")), canSeeLogs, logCount };
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
    // M-09: the units follow the inventory's field rules — a question on a hidden unit field isn't applied, its value is blank
    const units = me.fields.hidden("inventory");
    const { items, projects } = await this.inventory.recommend(need, shownAnswers(answers, units), settings.recommendTolerancePct);
    return {
      tolerancePct: settings.recommendTolerancePct,
      client: hideClient({ type: lead.type, space: lead.space, condition: lead.condition, budget: lead.budget?.toFixed(2) ?? null, area: lead.area }, me.fields.hidden("leads")),
      answers, projects, paymentMethods: activeValues(settings.paymentPlans), items: items.map((u) => hideRecommended(u, units)),
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
    // M-09: a unit field hidden from the sender isn't on the client's list (nor in the comment it writes)
    const hidden = me.fields.hidden("inventory");
    const units = found.map((u) => { const p = parts.get(u.id); return p && need.space ? { ...u, space: need.space, splitOf: u.space, totalPrice: p.price } : u; })
      .map((u) => hideListUnit(u, hidden));
    const now = new Date();
    const pdf = await this.documents.pdf(unitListHtml(lead.name, units, now, hidden), now);
    await this.db.$transaction(async (tx) => {
      if (!(await this.repo.findInScope(ownedBy(me) as never, id, tx))) throw new NotFoundException(NO_LEAD);
      const text = unitListLine(units, hidden);
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
  async create(me: CurrentUser, typed: CreateLead): Promise<CreatedLead> {
    const input = keepFixedCreate(typed, me.fields.fixed("leads")); // M-09: what the person may not set starts empty
    const dup = await this.repo.findByPhone(input.phones);
    if (dup) {
      await this.duplicates.record(me, dup, input);
      throw new ConflictException(`العميل ده موجود (${dup.code}) · اتبعت للأوبريشن تقرر`); // demo wording
    }

    // choosing the salesperson by hand is Operations' (the screen hides the choice from a salesperson; the API refuses it too)
    if (input.assignToId) {
      if (me.grants.scope === "own") throw new BadRequestException("الليد اللي بتدخّله بيفضل معاك · التحويل للأوبريشن");
      if (!(await this.repo.routingPeople()).some((p) => p.id === input.assignToId)) throw new BadRequestException("اختار سيلز من القايمة");
    }
    const created = await this.db.$transaction(async (tx) => {
      const router = new LeadRouter(await this.repo.lockRouting(tx)); // first: leads created at the same moment take their turns one after the other
      const placement = placeNewLead(
        { employeeId: me.employeeId, isTelesales: me.roles.includes(TELESALES), ownScope: me.grants.scope === "own" },
        { assignToId: input.assignToId, keep: input.keep },
      );
      if (placement.kind === "hand") router.assignedByHand(placement.to);
      // the area's rotation in today's order (1.23), without anyone whose account was switched off since they were ticked (1.13) or who is on approved leave today (1.15, M-05 6.2)
      const assignedToId = placement.kind === "route" ? router.next(input.area, await this.repo.areaPool(tx, input.area)) : placement.to;
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
      // a company that isn't in the sheet (1.20, M-01 2.1 · 6.1): Telesales adds it right here, anyone else's goes to her
      const newCompany = input.company && !company ? await this.companies.fromLead(tx, me, { id: lead.id, code: lead.code }, input.company, input.companyCategory) : null;
      if (newCompany?.companyId) await tx.lead.update({ where: { id: lead.id }, data: { companyId: newCompany.companyId } });
      const [to] = assignedToId ? await this.repo.employeeNames([assignedToId], tx) : [];
      return { id: lead.id, code: lead.code, ownedByTelesales: lead.ownedByTelesales, assignedTo: to ?? null, placement: placement.kind, name: lead.name, area: lead.area, newCompany: newCompany?.notify ? input.company ?? null : null };
    });
    // «ليد جديد اتوزع» (1.29 rules, default: the salesperson and the Team Leaders): a lead that went to someone by
    // the rotation or by Operations' hand — not one Telesales keeps or a salesperson entered for themselves (demo)
    if (created.assignedTo && (created.placement === "route" || created.placement === "hand")) await this.notifyAssigned(created.id, created.name, created.area, created.assignedTo.id);
    if (created.newCompany) await this.companies.notifyNew(created.newCompany, created.code);
    return { id: created.id, code: created.code, ownedByTelesales: created.ownedByTelesales, assignedTo: created.assignedTo };
  }

  /**
   * The area's rotation as a new lead gets it, for the queues that route by it (New Lead 1.17, Draft 1.26): without
   * anyone switched off (1.13) or on approved leave today (1.15), in today's order (1.23). Inside the caller's transaction.
   */
  areaPool(tx: Prisma.TransactionClient, area: string): Promise<string[]> {
    return this.repo.areaPool(tx, area);
  }

  /** The lead rules' «ليد جديد اتوزع» for one lead and the salesperson it went to. */
  async notifyAssigned(leadId: string, name: string, area: string, employeeId: string) {
    const [rules, owner] = await Promise.all([this.rules.get(), this.repo.ownerAccounts(employeeId)]);
    if (!owner) return;
    const to = ruleRecipients(rules.newLead, { ownerUserId: owner.userId, ownerTlUserId: owner.teamLeader?.userId ?? null });
    await this.notifications.notify({ event: "lead.assigned", text: `ليد جديد ${name} راح لـ ${owner.name} (${area})`, link: `/leads?open=${leadId}`, to, channels: [...rules.newLead.ch] });
  }

  /** M-09 2.2 · 7.1: how many open leads (not Done Deal / Not Interested / Cancellation) a leaver still holds. */
  openCount(employeeId: string) {
    return this.db.lead.count({ where: openOf(employeeId) });
  }

  /**
   * M-09 2.2 · 7.1: a leaver's open leads go to `toId` (Employee ids) inside the caller's transaction (the manager's
   * approval), with a fresh SLA clock as in «حوّله» (1.14); each lead's log says from whom (demo admin.js).
   */
  async handOver(tx: Prisma.TransactionClient, fromId: string, toId: string, byUserId: string): Promise<string[]> {
    const ids = (await tx.lead.findMany({ where: openOf(fromId), select: { id: true } })).map((l) => l.id);
    if (!ids.length) return ids;
    const [from] = await this.repo.employeeNames([fromId], tx);
    await tx.lead.updateMany({ where: { id: { in: ids } }, data: { assignedToId: toId, assignedAt: new Date(), touched: false, firstActionAt: null, slaWarnedAt: null } });
    for (const id of ids) await this.repo.addActivity(tx, id, "assign", `اتنقل من ${from?.name ?? ""} (الحساب اتوقف)`, byUserId);
    return ids;
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
        data: { assignedToId: to.id, assignedAt: new Date(), ownedByTelesales: false, touched: false, firstActionAt: null, slaWarnedAt: null, draft: null },
      });
      // handed out of a Draft tab this way too (1.26): that stay ends with this decision
      await tx.leadDraft.updateMany({ where: { leadId: id, decidedAt: null }, data: { decidedAt: new Date(), decidedById: me.id, decision: "hand", toId: to.id } });
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

  /**
   * «تعديل البيانات» (demo leads.js leadEdit · «leads: edit»): the lead's details, in the caller's scope. A mobile
   * added here that another lead already has is refused with that lead's code: the same number never becomes two
   * leads, and duplicates are Operations' call (M-01 Q7) — the same check as a new lead. A company that isn't in the
   * sheet goes the way it does from the new-lead form (1.20). Audited old → new, with a line in the Activity (demo).
   */
  async update(me: CurrentUser, id: string, typed: UpdateLead) {
    const saved = await this.db.$transaction(async (tx) => {
      const lead = await this.repo.editable(ownedBy(me) as never, id, tx);
      if (!lead) throw new NotFoundException(NO_LEAD);
      // M-09: a field the person may not change (or that their form left out) keeps what the lead has
      const input = keepFixedUpdate(typed, { phones: lead.phones, area: lead.area, type: lead.type, company: lead.company?.name ?? null, space: lead.space,
        condition: lead.condition, budget: lead.budget?.toFixed(2) ?? null, note: lead.note }, me.fields.fixed("leads"));
      const added = input.phones.filter((p) => !lead.phones.includes(p));
      const dup = added.length ? await this.repo.findByPhone(added, id) : null;
      if (dup) throw new ConflictException(`الرقم ده موجود في ليد تاني (${dup.code}) · العميل ده مكرر والأوبريشن هي اللي تقرر`);
      const company = input.company || null;
      const before = { name: lead.name, kind: lead.kind === "BROKER" ? "broker" : "client", company: lead.company?.name ?? null, phones: lead.phones, area: lead.area,
        type: lead.type, space: lead.space, condition: lead.condition, budget: lead.budget?.toFixed(2) ?? null, note: lead.note };
      const after = { name: input.name, kind: input.kind, company, phones: input.phones, area: input.area, type: input.type, space: input.space ?? null,
        condition: input.condition || null, budget: input.budget ? toDecimal(fromDecimal(input.budget)) : null, note: input.note || null };
      const diff = changes(before, after);
      if (!diff) return null;
      const inSheet = company ? await this.repo.companyByName(tx, company) : null;
      const companyChanged = "company" in diff.after;
      await this.repo.updateLead(tx, id, {
        name: after.name, kind: after.kind === "broker" ? "BROKER" : "CLIENT", phones: after.phones, area: after.area, type: after.type,
        space: after.space, condition: after.condition, budget: after.budget, note: after.note, ...(companyChanged ? { companyId: inSheet?.id ?? null } : {}),
      });
      const newCompany = companyChanged && company && !inSheet ? await this.companies.fromLead(tx, me, { id, code: lead.code }, company, undefined) : null;
      if (newCompany?.companyId) await this.repo.updateLead(tx, id, { companyId: newCompany.companyId });
      await this.repo.addActivity(tx, id, "edit", "اتعدّلت بيانات الليد", me.id); // a system line (Logs), not a comment
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "update", userId: me.id, ...diff }, tx);
      return newCompany?.notify ? { company: company!, code: lead.code } : null;
    });
    if (saved) await this.companies.notifyNew(saved.company, saved.code);
    return this.get(me, id);
  }

  /**
   * «أرشفة» (demo leads.js leadArchive · «leads: delete» = «يأرشف / يمسح»): the lead leaves every list, the board and
   * the counts but is never deleted (archivedAt); audited. Only a lead in the caller's scope.
   */
  async archive(me: CurrentUser, id: string) {
    await this.db.$transaction(async (tx) => {
      const lead = await this.repo.findInScope(ownedBy(me) as never, id, tx);
      if (!lead) throw new NotFoundException(NO_LEAD);
      const at = new Date();
      if (!(await tx.lead.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: at } })).count) throw new NotFoundException(NO_LEAD);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "archive", userId: me.id, before: { archivedAt: null }, after: { archivedAt: at.toISOString() } }, tx);
    });
    return { id, archived: true };
  }

  /**
   * The list's bulk bar (demo shell.js bulkApply): each picked lead goes through the same use case as one lead —
   * «حوّل لسيلز…» is «اسحب الليد وحوّله» (1.14: «leads: approve», that salesperson's next turn is used up, Q2) and
   * «غيّر المرحلة…» is the stage change — so each one is checked against the caller's scope and audited on its own.
   * A lead already with that salesperson / in that stage is left as it is (demo). What failed is reported, not hidden.
   */
  async batch(me: CurrentUser, input: LeadBatch): Promise<LeadBatchResult> {
    if (input.to && !me.grants.can("leads", "approve")) throw new ForbiddenException("التحويل لسيلز للأوبريشن ومدير المبيعات والإدارة بس");
    const now = await this.repo.batchState(ownedBy(me) as never, input.ids);
    return this.eachLead(input.ids, async (id) => {
      const lead = now.get(id);
      if (!lead) throw new NotFoundException(NO_LEAD);
      if (input.to && lead.assignedToId !== input.to) await this.assign(me, id, { to: input.to });
      if (input.stage && STAGE_LABEL.get(lead.stage) !== input.stage) await this.changeStage(me, id, { stage: input.stage });
    });
  }

  /** «أرشفة» on the picked leads (demo shell.js bulkArchive): each one as «أرشفة» on one lead, audited on its own. */
  batchArchive(me: CurrentUser, ids: string[]): Promise<LeadBatchResult> {
    return this.eachLead(ids, (id) => this.archive(me, id));
  }

  private async eachLead(ids: string[], fn: (id: string) => Promise<unknown>): Promise<LeadBatchResult> {
    const failed: LeadBatchResult["failed"] = [];
    for (const id of [...new Set(ids)]) {
      try { await fn(id); } catch (e) { failed.push({ id, error: e instanceof Error ? e.message : "حصل خطأ" }); }
    }
    return { done: new Set(ids).size - failed.length, failed };
  }

  /**
   * «تصدير الليدز» (M-12: «أي جدول في السيستم يتصدّر Excel»; demo U.exportBtn behind «leads: export»): the list as it
   * is filtered, in the caller's scope, with the demo's columns. Audited (who exported what).
   */
  async exportRows(me: CurrentUser, f: LeadFilters) {
    const hidden = me.fields.hidden("leads");
    const rows = (await this.repo.exportRows(ownedBy(me) as never, shownLeadFilters(f, hidden), EXPORT_LIMIT)).map((r) => ({ ...r, ...hiddenExport(r, hidden) }));
    const names = await this.salespeopleNames(rows.map((r) => r.assignedToId));
    await this.audit.record({ module: "leads", entity: "Lead", entityId: "export", action: "export", userId: me.id,
      after: { rows: rows.length, filters: Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== undefined && k !== "page" && k !== "pageSize")) } });
    return rows.map((r) => ({
      code: r.code, name: r.name, company: r.company?.name ?? "", phones: r.phones.join(" / "), area: r.area, type: r.type, space: r.space,
      budget: r.budget?.toFixed(2) ?? "", channel: r.channel, campaign: r.campaign?.name ?? "", sales: r.assignedToId ? names.get(r.assignedToId) ?? "" : "",
      stage: STAGE_LABEL.get(r.stage) ?? r.stage, qualified: r.qualified ? "Yes" : "No", createdAt: r.createdAt,
    }));
  }

  /**
   * Stage change: Qualified is sticky (isQualifiedAfter), the SLA clock stops on the first action. No Answer records
   * who marked it and when: the No Answer job moves it 24 hours later, only if it was the salesperson's own mark (1.17).
   */
  async changeStage(me: CurrentUser, id: string, input: ChangeStage) {
    const rules = await this.rules.get();
    const moved = await this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { AND: [ownedBy(me) as never, { id, archivedAt: null }] } }); // an archived lead has left every list
      if (!lead) throw new NotFoundException(NO_LEAD);
      const noAnswer = input.stage === "No Answer";
      // 1.27: Not Interested / Cancellation leaves whoever had it for the Draft Admin, where Operations decides
      const toAdmin = goesToDraftAdmin(input.stage, rules, lead);
      const next = await tx.lead.update({
        where: { id },
        data: { stage: toDb(input.stage), qualified: isQualifiedAfter(lead.qualified, input.stage), touched: true,
          ...(noAnswer ? { noAnswerCount: { increment: 1 }, naMarkedAt: new Date(), naMarkedById: me.employeeId, naRemindedAt: null } : {}),
          ...(toAdmin ? { draft: "admin", assignedToId: null, ownedByTelesales: false } : {}) },
      });
      const activity = await this.repo.addActivity(tx, id, "stage", `المرحلة بقت ${input.stage}${input.note ? ` · ${input.note}` : ""}`, me.id);
      await this.repo.markActed(tx, id, activity.at);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "stage", userId: me.id,
        before: { stage: lead.stage, ...(toAdmin ? { assignedToId: lead.assignedToId } : {}) },
        after: { stage: next.stage, ...(toAdmin ? { assignedToId: null, draft: "admin" } : {}) } }, tx);
      if (input.stage === "Done Deal") await this.clientFile(tx, me, id);
      if (toAdmin) await tx.leadDraft.create({ data: { leadId: id, kind: "admin", fromId: lead.assignedToId, stage: toDb(input.stage) } });
      return { next, toAdmin, from: lead.assignedToId };
    });
    if (moved.toAdmin) await this.notifyDraftAdmin(moved.next, input.stage, moved.from, rules);
    return moved.next;
  }

  /** Demo: «… بقى Not Interested عند فلان · راح الـ Draft Admin», to the people of draftAdmin.notify (1.27). */
  private async notifyDraftAdmin(lead: { id: string; code: string; name: string }, stage: string, fromId: string | null, rules: LeadRules) {
    const owner = fromId ? await this.repo.ownerAccounts(fromId) : null;
    const to = ruleRecipients(rules.draftAdmin.notify, { ownerUserId: owner?.userId ?? null, ownerTlUserId: owner?.teamLeader?.userId ?? null });
    await this.notifications.notify({ event: "lead.draft_admin", text: `${lead.name} (${lead.code}) بقى ${stage} عند ${owner?.name ?? "—"} · راح الـ Draft Admin`,
      link: `/leads?open=${lead.id}`, to, channels: [...rules.draftAdmin.notify.ch] });
  }

  /** «سجّل صفقة» (M-02 2.1 step 1): the caller's leads that were ever Interested; one of them when `id` is given. */
  dealLeads(me: CurrentUser, id?: string) {
    return this.repo.dealLeads(ownedBy(me) as never, ownedBy(me, "fromId") as never, id);
  }

  /**
   * A deal on a lead in the Draft brings it back to the salesperson it was pulled from (demo deals.js «رجع من الـ Draft
   * لـ … بصفقة …»), in the deal's own transaction: the stay ends with decision «deal». Claimed on draft = "draft", so a
   * decision by Operations at the same moment can't also apply.
   */
  async backFromDraft(tx: Prisma.TransactionClient, me: CurrentUser, lead: { id: string; drafts: Array<{ id: string; fromId: string | null }> }, dealCode: string) {
    const stay = lead.drafts[0];
    if (!stay?.fromId) return null;
    const now = new Date();
    const moved = await tx.lead.updateMany({ where: { id: lead.id, draft: "draft" }, data: { draft: null, assignedToId: stay.fromId, assignedAt: now, slaWarnedAt: null } });
    if (!moved.count) throw new ConflictException("الليد ده اتحرّك من الـ Draft دلوقتي · جرّب تاني");
    await tx.leadDraft.update({ where: { id: stay.id }, data: { decidedAt: now, decidedById: me.id, decision: "deal", toId: stay.fromId } });
    const [from] = await this.repo.employeeNames([stay.fromId], tx);
    await this.repo.addActivity(tx, lead.id, "assign", `رجع من الـ Draft لـ ${from?.name ?? "—"} بصفقة ${dealCode}`, me.id);
    await this.audit.record({ module: "leads", entity: "Lead", entityId: lead.id, action: "draft-route", userId: me.id,
      before: { draft: "draft", assignedToId: null, from: stay.fromId }, after: { draft: null, assignedToId: stay.fromId, decision: "deal", deal: dealCode } }, tx);
    return { fromId: stay.fromId, fromName: from?.name ?? "—" };
  }

  /** Demo: «فلان فتح صفقة D-… على … من الـ Draft · الليد رجعله», to the people of draft.notify (1.26). */
  async notifyBackFromDraft(lead: { id: string; name: string }, back: { fromId: string; fromName: string }, dealCode: string) {
    const rules = await this.rules.get();
    const owner = await this.repo.ownerAccounts(back.fromId);
    const to = ruleRecipients(rules.draft.notify, { ownerUserId: owner?.userId ?? null, ownerTlUserId: owner?.teamLeader?.userId ?? null });
    await this.notifications.notify({ event: "lead.assigned", text: `${back.fromName} فتح صفقة ${dealCode} على ${lead.name} من الـ Draft · الليد رجعله`,
      link: `/leads?open=${lead.id}`, to, channels: [...rules.draft.notify.ch] });
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
  async visitUnits(me: CurrentUser, q?: string) {
    const noSpace = me.fields.hidden("inventory").has("space"); // M-09: the inventory's hidden field stays hidden here too
    return (await this.inventory.forVisit(q)).map((u) => (noSpace ? { ...u, space: 0 } : u));
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
    case "Lead:update": return "اتعدّلت بيانات الليد";
    case "Lead:archive": return "الليد اتأرشف";
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

/** M-09: the export's hidden columns, blank (the controller leaves them out too). */
function hiddenExport(r: { company: { name: string } | null; phones: string[]; area: string; type: string; space: number | null; budget: Prisma.Decimal | null; channel: string; campaign: { id: string; name: string } | null }, hidden: ReadonlySet<string>) {
  const h = (k: string) => hidden.has(k);
  return {
    company: h("company") ? null : r.company, phones: h("phones") ? [] : r.phones, area: h("area") ? "" : r.area, type: h("type") ? "" : r.type,
    space: h("space") ? null : r.space, budget: h("budget") ? null : r.budget, channel: h("channel") ? "" : r.channel, campaign: h("campaign") ? null : r.campaign,
  };
}

type SlaClock = (r: Pick<LeadRecord, "stage" | "touched" | "ownedByTelesales" | "assignedAt">) => LeadRow["sla"];

function toRow({ assignedToId, budget, kind, company, ...r }: LeadRecord, names: Map<string, string>, sla: SlaClock): LeadRow {
  return {
    ...r, kind: kind === "BROKER" ? "broker" : "client", budget: budget?.toFixed(2) ?? null, // money on the wire is a decimal string
    company: company?.name ?? null, // 1.31: under the name in the list (demo leads.js listView)
    stage: STAGE_LABEL.get(r.stage) ?? r.stage, sla: sla(r),
    assignedTo: assignedToId ? { id: assignedToId, name: names.get(assignedToId) ?? "" } : null,
    assignedAt: iso(r.assignedAt), arrivedAt: r.arrivedAt.toISOString(), createdAt: r.createdAt.toISOString(),
  };
}

function toDetail(lead: LeadDetailRecord, salespeople: Map<string, string>, people: Map<string, string>, sla: SlaClock, inv: ReadonlySet<string> = new Set()): Omit<LeadDetail, "canSeeLogs" | "logCount"> {
  const { activities, visits, firstActionAt, firstCallAt, condition, note, post, noAnswerCount, rotation, newLeadRequestedAt, newLeadRoutedAt, _count, ...row } = lead;
  const now = Date.now();
  return {
    ...toRow(row, salespeople, sla), condition, note, post, noAnswerCount, rotation, newLeadPending: !!newLeadRequestedAt && !newLeadRoutedAt,
    hasDeal: _count.deals > 0, firstActionAt: iso(firstActionAt),
    firstCallAt: iso(firstCallAt), firstCallOnTime: firstCallOnTime(row.arrivedAt, firstCallAt),
    activities: activities.map(({ byUserId, at, ...a }) => ({
      ...a, at: at.toISOString(), by: byUserId ? { id: byUserId, name: people.get(byUserId) ?? "" } : null,
    })),
    visits: visits.map((v): VisitRow => ({
      id: v.id, kind: kindOf(v.kind), at: v.at.toISOString(), extra: v.extra, outcome: v.outcome === "done" || v.outcome === "not_done" ? v.outcome : null,
      due: !v.outcome && v.postponeStatus !== "pending" && v.postponeStatus !== "approved" && v.at.getTime() <= now, units: v.units.map((u) => (inv.has("space") ? { ...u.unit, space: 0 } : u.unit)), // M-09: the inventory's hidden space
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
