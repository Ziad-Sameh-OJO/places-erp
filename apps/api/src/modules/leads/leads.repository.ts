import { Inject, Injectable } from "@nestjs/common";
import { type Prisma, type PrismaClient, areaPool, lockRouting, saveRouting } from "@places/db";
import type { LeadFilters } from "@places/contracts";
import { dayStart, localDate, type RoutingState } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

/**
 * Data access only: queries and writes, no business decisions. Keeping Prisma here means the service reads like
 * the requirements and the queries can be tuned (indexes, selects) without touching the rules.
 */
@Injectable()
export class LeadsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /** `scope` is the caller's data scope (ownedBy), always ANDed in the query itself, never filtered afterwards. */
  list(scope: Prisma.LeadWhereInput, f: LeadQuery) {
    const where = leadWhere(scope, f);
    return this.db.$transaction([
      this.db.lead.findMany({ where, select: LEAD_ROW, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.lead.count({ where }),
    ]);
  }

  /** The KPI tiles and saved views' counts over the whole scope (one round trip). */
  summary(scope: Prisma.LeadWhereInput, kind: "CLIENT" | "BROKER", weekAgo: Date, twoWeeksAgo: Date) {
    const count = (w: Prisma.LeadWhereInput) => this.db.lead.count({ where: { AND: [scope, { archivedAt: null, draft: null, kind }, w] } });
    return this.db.$transaction([
      count({}), count({ stage: "FRESH" }), count({ qualified: true }), count({ stage: "NO_ANSWER" }), count({ stage: "INTERESTED" }),
      count({ createdAt: { gte: weekAgo } }), count({ createdAt: { gte: twoWeeksAgo, lt: weekAgo } }),
    ]);
  }

  /** People who hold leads (sales, TLs, Telesales), still active, within `where` (the caller's scope). */
  salespeople(where: Prisma.EmployeeWhereInput) {
    return this.db.employee.findMany({
      where: { AND: [where, { user: { status: { not: "DISABLED" }, roles: { some: { role: { key: { in: [...LEAD_HOLDERS] } } } } } }] },
      select: { id: true, name: true, user: { select: { roles: { select: { role: { select: { key: true } } } } } } }, orderBy: { name: "asc" },
    }).then((rows) => rows.map((r) => ({ id: r.id, name: r.name, roles: r.user.roles.map((x) => x.role.key) })));
  }

  /** The picked leads the caller may act on, with what the bulk bar compares (scope in the query). */
  batchState(scope: Prisma.LeadWhereInput, ids: string[]) {
    return this.db.lead.findMany({ where: { AND: [scope, { id: { in: ids }, archivedAt: null }] }, select: { id: true, stage: true, assignedToId: true } })
      .then((rows) => new Map(rows.map((r) => [r.id, r])));
  }

  /** «تصدير الليدز»: the list under the same scope and filters, newest first, up to `limit` rows. */
  exportRows(scope: Prisma.LeadWhereInput, f: LeadQuery, limit: number) {
    return this.db.lead.findMany({ where: leadWhere(scope, f), select: { ...LEAD_ROW, company: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
  }

  /**
   * The rotation state (every area's cursor, everyone's skipped turns), locked until the transaction ends: two leads
   * created at the same moment would otherwise both read the same cursor and one turn would be lost (found by testing).
   * Today's (1.23): a new day starts from the top of the day's order. Shared with the worker's jobs (@places/db).
   */
  lockRouting(tx: Prisma.TransactionClient): Promise<RoutingState> {
    return lockRouting(tx, localDate(new Date()));
  }

  saveRouting(tx: Prisma.TransactionClient, state: RoutingState) {
    return saveRouting(tx, state);
  }

  /** Who may get a lead of `area` now, in today's rotation order (1.13 · 1.15 · 1.23), shared with the worker's jobs. */
  areaPool(tx: Prisma.TransactionClient, area: string) {
    return areaPool(tx, area, localDate(new Date()));
  }

  /** A salesperson's account and their Team Leader's: who «owner» and «ownerTl» are in the lead rules. */
  ownerAccounts(employeeId: string) {
    return this.db.employee.findUnique({ where: { id: employeeId }, select: { name: true, userId: true, teamLeader: { select: { userId: true } } } });
  }

  /** People still working here, by user id (the rules name people: «مين يتبلّغ», 1.29). */
  activePeople() {
    return this.db.employee.findMany({ where: { user: { status: { not: "DISABLED" } } }, select: { userId: true, name: true }, orderBy: { name: "asc" } })
      .then((rows) => rows.map((r) => ({ id: r.userId, name: r.name })));
  }

  /** People with a role, still working here, by user id (the Telesales who receive No Answer leads). */
  activeWithRole(role: string) {
    return this.db.employee.findMany({ where: { user: { status: { not: "DISABLED" }, roles: { some: { role: { key: role } } } } }, select: { userId: true, name: true }, orderBy: { name: "asc" } })
      .then((rows) => rows.map((r) => ({ id: r.userId, name: r.name })));
  }

  /** The salespeople the routing table lists (the demo's «السيلز»): people with the sales role, still working here. */
  routingPeople() {
    return this.db.employee.findMany({
      where: { user: { status: { not: "DISABLED" }, roles: { some: { role: { key: "sales" } } } } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
  }

  campaigns() {
    return this.db.campaign.findMany({ select: { id: true, name: true, channel: true }, orderBy: { startsOn: "desc" } });
  }

  /** The Kanban: per stage the real count and the newest `perLane` rows, under the same scope and filters as the list. */
  board(scope: Prisma.LeadWhereInput, f: LeadQuery,stages: readonly string[], perLane: number) {
    const where = leadWhere(scope, f);
    return Promise.all([
      this.db.lead.groupBy({ by: ["stage"], where, _count: { _all: true } }),
      Promise.all(stages.map((stage) => this.db.lead.findMany({
        where: { AND: [where, { stage: stage as Prisma.LeadWhereInput["stage"] }] }, select: LEAD_ROW, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: perLane,
      }))),
    ]);
  }

  /** How many leads each tab has under the current filters (the tab itself set aside). */
  tabCounts(scope: Prisma.LeadWhereInput, f: LeadQuery) {
    return this.db.lead.groupBy({ by: ["kind"], where: leadWhere(scope, { ...f, kind: undefined }), _count: { _all: true } });
  }

  /** One lead with its Activity (newest first). Out of the caller's scope it simply isn't found. */
  detail(scope: Prisma.LeadWhereInput, id: string) {
    return this.db.lead.findFirst({ where: { AND: [scope, { id, archivedAt: null }] }, select: LEAD_DETAIL });
  }

  /** What the client wants and the narrowing answers (2.12), when the lead is in the caller's scope. */
  clientNeed(scope: Prisma.LeadWhereInput, id: string, tx: Prisma.TransactionClient = this.db) {
    return tx.lead.findFirst({ where: { AND: [scope, { id, archivedAt: null }] }, select: { name: true, type: true, space: true, condition: true, budget: true, area: true, answers: true } });
  }

  /** The units sent to the client (2.13): a unit sent again keeps its first time. */
  addSuggestedUnits(tx: Prisma.TransactionClient, leadId: string, unitIds: string[], byUserId: string) {
    return tx.leadUnit.createMany({ data: unitIds.map((unitId) => ({ leadId, unitId, byUserId })), skipDuplicates: true });
  }

  setAnswers(tx: Prisma.TransactionClient, id: string, answers: Prisma.InputJsonValue) {
    return tx.lead.update({ where: { id }, data: { answers } });
  }

  /** The id when the lead exists and is inside the caller's scope — the same rule as reading it. */
  findInScope(scope: Prisma.LeadWhereInput, id: string, tx: Prisma.TransactionClient = this.db) {
    return tx.lead.findFirst({ where: { AND: [scope, { id, archivedAt: null }] }, select: { id: true, name: true, firstActionAt: true } });
  }

  /** Pass `tx` when called inside a transaction: a second connection there can starve the pool under load. */
  employeeNames(ids: string[], tx: Prisma.TransactionClient = this.db) {
    return tx.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }

  /**
   * «سجّل صفقة» (M-02): leads in scope that were ever Interested, with their company — and the leads pulled to the
   * Draft from someone in scope (`draftScope` on the stay's fromId), with that open stay (M-01 «السيلز يقدر يفتح صفقة
   * على ليده اللي في الـ Draft», 4 Nov meeting).
   */
  dealLeads(scope: Prisma.LeadWhereInput, draftScope: Prisma.LeadDraftWhereInput, id?: string) {
    const openDraft = { kind: "draft", decidedAt: null } satisfies Prisma.LeadDraftWhereInput;
    return this.db.lead.findMany({
      where: { AND: [{ archivedAt: null, qualified: true }, id ? { id } : {},
        { OR: [scope, { draft: "draft", drafts: { some: { AND: [openDraft, { fromId: { not: null } }, draftScope] } } }] }] },
      select: { id: true, code: true, name: true, channel: true, stage: true, qualified: true, assignedToId: true, createdAt: true, draft: true, company: { select: { name: true } },
        drafts: { where: openDraft, select: { id: true, fromId: true }, take: 1 } },
      orderBy: { updatedAt: "desc" }, take: 300,
    });
  }

  userNames(userIds: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } });
  }

  /** 1.33: the lead the note goes on, inside the writer's scope. */
  tlNoteTarget(scope: Prisma.LeadWhereInput, id: string) {
    return this.db.lead.findFirst({ where: { AND: [scope, { id, archivedAt: null }] }, select: { id: true, name: true, assignedToId: true, tlNote: true } });
  }

  setTlNote(tx: Prisma.TransactionClient, id: string, note: string | null, byUserId: string) {
    return tx.lead.update({ where: { id }, data: { tlNote: note, tlNoteAt: note ? new Date() : null, tlNoteById: note ? byUserId : null, tlNoteSeenAt: null } });
  }

  /** The salesperson opened the lead: the note leaves their «مهامي النهارده» (written once per note, not on every open). */
  markTlNoteSeen(id: string, noteAt: Date) {
    return this.db.lead.updateMany({ where: { id, OR: [{ tlNoteSeenAt: null }, { tlNoteSeenAt: { lt: noteAt } }] }, data: { tlNoteSeenAt: new Date() } });
  }

  addActivity(tx: Prisma.TransactionClient, leadId: string, kind: ActivityKind, text: string, byUserId: string | null) {
    return tx.leadActivity.create({ data: { leadId, kind, text, byUserId } });
  }

  /** The lead's audit trail: entries on the lead itself and on what belongs to it (comments, calls, duplicates). */
  auditCount(leadId: string) {
    return this.db.auditLog.count({ where: { module: "leads", OR: [{ entityId: leadId }, { after: { path: ["leadId"], equals: leadId } }] } });
  }

  auditFor(leadId: string) {
    return this.db.auditLog.findMany({
      where: { module: "leads", OR: [{ entityId: leadId }, { after: { path: ["leadId"], equals: leadId } }] },
      select: { id: true, entity: true, action: true, userId: true, before: true, after: true, at: true }, orderBy: { at: "desc" },
    });
  }

  /** A Visit / Meeting with the units picked (1.9). */
  addVisit(tx: Prisma.TransactionClient, leadId: string, v: { kind: string; at: Date; extra: string | null; unitIds: string[] }, byUserId: string) {
    return tx.leadVisit.create({ data: { leadId, kind: v.kind, at: v.at, extra: v.extra, byUserId, units: { create: v.unitIds.map((unitId) => ({ unitId })) } } });
  }

  findVisit(tx: Prisma.TransactionClient, leadId: string, visitId: string) {
    return tx.leadVisit.findFirst({ where: { id: visitId, leadId }, select: { id: true, kind: true, at: true, extra: true, outcome: true, postponeStatus: true, units: { select: { unitId: true } } } });
  }

  /** «تعديل الميعاد»: a new time means a new Alarm. */
  updateVisit(tx: Prisma.TransactionClient, visitId: string, v: { kind: string; at: Date; extra: string | null; unitIds: string[] }, timeChanged: boolean) {
    return tx.leadVisit.update({ where: { id: visitId }, data: {
      kind: v.kind, at: v.at, extra: v.extra, ...(timeChanged ? { alarmedAt: null } : {}),
      units: { deleteMany: {}, create: v.unitIds.map((unitId) => ({ unitId })) },
    } });
  }

  /** Marked once: a second click (or two tabs) can't mark it again. */
  markVisit(tx: Prisma.TransactionClient, visitId: string, outcome: "done" | "not_done") {
    return tx.leadVisit.updateMany({ where: { id: visitId, outcome: null }, data: { outcome } });
  }

  setStage(tx: Prisma.TransactionClient, id: string, stage: string, qualified: boolean) {
    return tx.lead.update({ where: { id }, data: { stage: stage as never, qualified } });
  }

  addCall(tx: Prisma.TransactionClient, leadId: string, byUserId: string) {
    return tx.leadCall.create({ data: { leadId, byUserId } });
  }

  /** Only the first call is the one the 30-minute KPI looks at. */
  markFirstCall(tx: Prisma.TransactionClient, id: string, at: Date) {
    return tx.lead.updateMany({ where: { id, firstCallAt: null }, data: { firstCallAt: at } });
  }

  countCalls(byUserId: string, since: Date) {
    return this.db.leadCall.count({ where: { byUserId, at: { gte: since } } });
  }

  /** Any action by the salesperson stops the SLA clock (M-01 «3 ساعات من غير أي أكشن»); only the first one is kept. */
  markActed(tx: Prisma.TransactionClient, id: string, at: Date) {
    return tx.lead.updateMany({ where: { id, firstActionAt: null }, data: { firstActionAt: at, touched: true } });
  }

  /** `except`: the lead being edited — its own mobiles aren't a duplicate of itself. */
  findByPhone(phones: string[], except?: string) {
    return this.db.lead.findFirst({ where: { phones: { hasSome: phones }, archivedAt: null, ...(except ? { id: { not: except } } : {}) }, select: { id: true, code: true } });
  }

  /** What «تعديل البيانات» changes, when the lead is in the caller's scope (M-01 «تعديل البيانات»). */
  editable(scope: Prisma.LeadWhereInput, id: string, tx: Prisma.TransactionClient) {
    return tx.lead.findFirst({ where: { AND: [scope, { id, archivedAt: null }] },
      select: { id: true, code: true, name: true, kind: true, phones: true, area: true, type: true, space: true, condition: true, budget: true, note: true, company: { select: { name: true } } } });
  }

  /** Every arrival counts for its channel / campaign, the duplicate ones too (M-04 Q22). */
  addArrival(tx: Prisma.TransactionClient, a: { leadId: string; channel: string; campaignId: string | null; duplicate: boolean; byUserId: string }) {
    return tx.leadArrival.create({ data: a });
  }

  addDuplicate(tx: Prisma.TransactionClient, d: { leadId: string; arrivalId: string; data: Prisma.InputJsonValue; byUserId: string }) {
    return tx.leadDuplicate.create({ data: d });
  }

  /** Operations' queue: duplicates still waiting for a decision, oldest first. */
  pendingDuplicates() {
    return this.db.leadDuplicate.findMany({ where: { decidedAt: null, lead: { archivedAt: null } }, select: DUPLICATE_ROW, orderBy: { at: "asc" } });
  }

  /** The Telesales who receives (the rules' user id), else the first one by name; still working here (1.27). */
  telesalesEmployee(userId: string | null) {
    const active = { user: { status: { not: "DISABLED" as const }, roles: { some: { role: { key: "telesales" } } } } };
    return this.db.employee.findFirst({ where: userId ? { ...active, userId } : active, select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  /** The Draft Admin still waiting for a decision (not reviewed): the Alarm (1.27). */
  draftAdminWaiting() {
    return this.db.leadDraft.findMany({ where: { kind: "admin", decidedAt: null, keptAt: null, lead: { archivedAt: null } }, select: { at: true } });
  }

  /** How many leads wait in a Draft tab (1.26 · 1.27). */
  openDrafts(kind: string) {
    return this.db.leadDraft.count({ where: { kind, decidedAt: null, lead: { archivedAt: null } } });
  }

  /** A Draft tab: every open stay with its lead, the newest first (demo), and the lead's last touch by a person. */
  drafts(kind: string) {
    return this.db.leadDraft.findMany({
      where: { kind, decidedAt: null, lead: { archivedAt: null } }, orderBy: { at: "desc" },
      select: { id: true, at: true, fromId: true, days: true, keptAt: true, lead: { select: {
        id: true, code: true, name: true, stage: true, kind: true, area: true, assignedAt: true, createdAt: true, company: { select: { name: true } },
        activities: { where: { byUserId: { not: null } }, select: { at: true }, orderBy: { at: "desc" }, take: 1 },
      } } },
    });
  }

  openDraft(tx: Prisma.TransactionClient, id: string) {
    return tx.leadDraft.findFirst({ where: { id, decidedAt: null, lead: { archivedAt: null } }, select: { id: true, kind: true, fromId: true, keptAt: true, stage: true, lead: { select: { id: true, name: true, area: true } } } });
  }

  /** New Leads from Telesales that Operations hasn't routed yet (1.17), oldest first. */
  pendingNewLeads() {
    return this.db.lead.findMany({
      where: { newLeadRequestedAt: { not: null }, newLeadRoutedAt: null, archivedAt: null },
      select: { id: true, code: true, name: true, area: true, newLeadRequestedAt: true, newLeadRequestedById: true }, orderBy: { newLeadRequestedAt: "asc" },
    });
  }

  duplicate(tx: Prisma.TransactionClient, id: string) {
    return tx.leadDuplicate.findFirst({ where: { id, lead: { archivedAt: null } }, select: DUPLICATE_ROW });
  }

  /** Only the first decision wins: two people deciding at once can't both apply theirs. */
  claimDuplicate(tx: Prisma.TransactionClient, id: string, decidedById: string, decision: Prisma.InputJsonValue) {
    return tx.leadDuplicate.updateMany({ where: { id, decidedAt: null }, data: { decidedAt: new Date(), decidedById, decision } });
  }

  updateLead(tx: Prisma.TransactionClient, id: string, data: Prisma.LeadUncheckedUpdateInput) {
    return tx.lead.update({ where: { id }, data });
  }

  campaignNames(ids: string[]) {
    return this.db.campaign.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }

  /** A company from the companies sheet, by name in any case (the form's «الشركة»; adding new ones is 1.20). */
  companyByName(tx: Prisma.TransactionClient, name: string) {
    return tx.company.findFirst({ where: { name: { equals: name.trim(), mode: "insensitive" } }, select: { id: true } });
  }

  salesForArea(area: string) {
    return this.db.setting.findUnique({ where: { key: `routing:${area}` } });
  }

  nextCode(tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('sales.lead_code_seq') AS n`; // created by a migration
  }
}

/** Role keys of the people a lead can be assigned to (seed-data/roles.json). */
const LEAD_HOLDERS = ["sales", "tl", "telesales"] as const;

const LEAD_ROW = {
  id: true, code: true, name: true, phones: true, area: true, type: true, space: true, budget: true, channel: true, stage: true, qualified: true, touched: true, ownedByTelesales: true, kind: true,
  assignedToId: true, assignedAt: true, arrivedAt: true, createdAt: true, campaign: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;
export type LeadRecord = Prisma.LeadGetPayload<{ select: typeof LEAD_ROW }>;

const LEAD_DETAIL = {
  ...LEAD_ROW, condition: true, note: true, post: true, firstCallAt: true, noAnswerCount: true, rotation: true, firstActionAt: true,
  newLeadRequestedAt: true, newLeadRoutedAt: true, tlNote: true, tlNoteAt: true, tlNoteById: true,
  company: { select: { name: true } }, _count: { select: { deals: true } },
  activities: { select: { id: true, kind: true, text: true, byUserId: true, at: true }, orderBy: [{ at: "desc" }, { id: "desc" }] },
  visits: { select: { id: true, kind: true, at: true, extra: true, outcome: true, postponeStatus: true, postponeReason: true, units: { select: { unit: { select: { id: true, code: true, project: true, space: true } } } } }, orderBy: [{ at: "desc" }, { id: "desc" }] },
} satisfies Prisma.LeadSelect;
export type LeadDetailRecord = Prisma.LeadGetPayload<{ select: typeof LEAD_DETAIL }>;

/** What a line of Activity is about (the column is text; these are the kinds the flows write). */
export type ActivityKind = "comment" | "stage" | "assign" | "call" | "visit" | "meeting" | "whatsapp" | "duplicate" | "edit";

const DUPLICATE_ROW = {
  id: true, at: true, byUserId: true, data: true, decidedAt: true,
  lead: { select: {
    id: true, code: true, name: true, phones: true, area: true, type: true, space: true, budget: true, channel: true, assignedToId: true,
    company: { select: { name: true } }, campaign: { select: { id: true, name: true } },
  } },
} satisfies Prisma.LeadDuplicateSelect;
export type DuplicateRecord = Prisma.LeadDuplicateGetPayload<{ select: typeof DUPLICATE_ROW }>;

/** The list's filters; `phoneSearch` false (M-09: the mobile is hidden from the caller): the search doesn't look at the mobiles. */
export type LeadQuery = LeadFilters & { phoneSearch?: boolean };

function leadWhere(scope: Prisma.LeadWhereInput, f: LeadQuery): Prisma.LeadWhereInput {
  const digits = f.q?.replace(/\D/g, "") ?? "";
  return {
    // a lead in a Draft tab shows only there (1.26, demo): not in the list, the board or the counts
    AND: [scope, { archivedAt: null, draft: null },
      f.stage ? { stage: f.stage.toUpperCase().replace(/ /g, "_") as Prisma.LeadWhereInput["stage"] } : {},
      f.kind ? { kind: f.kind === "broker" ? "BROKER" : "CLIENT" } : {},
      f.area ? { area: f.area } : {}, f.channel ? { channel: f.channel } : {}, f.campaignId ? { campaignId: f.campaignId } : {},
      f.assignedToId ? { assignedToId: f.assignedToId } : {}, f.qualified !== undefined ? { qualified: f.qualified } : {},
      // the whole mobile (the GIN index), any part of the name, or the code typed in any case («l-1001»)
      f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: f.q.toUpperCase() }, ...(digits.length >= 10 && f.phoneSearch !== false ? [{ phones: { has: digits } }] : [])] } : {},
      // Cairo days, «to» included: up to the start of the next day
      f.from ? { createdAt: { gte: dayStart(f.from) } } : {},
      f.to ? { createdAt: { lt: dayStart(nextDay(f.to)) } } : {}],
  };
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
