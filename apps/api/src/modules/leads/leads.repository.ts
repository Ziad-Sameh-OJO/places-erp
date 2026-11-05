import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { LeadFilters } from "@places/contracts";
import { dayStart, type RoutingState } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

/**
 * Data access only: queries and writes, no business decisions. Keeping Prisma here means the service reads like
 * the requirements and the queries can be tuned (indexes, selects) without touching the rules.
 */
@Injectable()
export class LeadsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /** `scope` is the caller's data scope (ownedBy), always ANDed in the query itself, never filtered afterwards. */
  list(scope: Prisma.LeadWhereInput, f: LeadFilters) {
    const where = leadWhere(scope, f);
    return this.db.$transaction([
      this.db.lead.findMany({ where, select: LEAD_ROW, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.lead.count({ where }),
    ]);
  }

  /** The KPI tiles and saved views' counts over the whole scope (one round trip). */
  summary(scope: Prisma.LeadWhereInput, kind: "CLIENT" | "BROKER", weekAgo: Date, twoWeeksAgo: Date) {
    const count = (w: Prisma.LeadWhereInput) => this.db.lead.count({ where: { AND: [scope, { archivedAt: null, kind }, w] } });
    return this.db.$transaction([
      count({}), count({ stage: "FRESH" }), count({ qualified: true }), count({ stage: "NO_ANSWER" }), count({ stage: "INTERESTED" }),
      count({ createdAt: { gte: weekAgo } }), count({ createdAt: { gte: twoWeeksAgo, lt: weekAgo } }),
    ]);
  }

  /** People who hold leads (sales, TLs, Telesales), still active, within `where` (the caller's scope). */
  salespeople(where: Prisma.EmployeeWhereInput) {
    return this.db.employee.findMany({
      where: { AND: [where, { user: { status: { not: "DISABLED" }, roles: { some: { role: { key: { in: [...LEAD_HOLDERS] } } } } } }] },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
  }

  /**
   * The rotation state (every area's cursor, everyone's skipped turns), locked until the transaction ends: two leads
   * created at the same moment would otherwise both read the same cursor and one turn would be lost (found by testing).
   */
  async lockRouting(tx: Prisma.TransactionClient): Promise<RoutingState> {
    await tx.$executeRaw`INSERT INTO "system"."Setting" ("key", "value", "updatedAt") VALUES ('routing', '{"cursor":{},"skipTurns":{}}'::jsonb, now()) ON CONFLICT ("key") DO NOTHING`;
    const [row] = await tx.$queryRaw<Array<{ value: RoutingState }>>`SELECT "value" FROM "system"."Setting" WHERE "key" = 'routing' FOR UPDATE`;
    return { cursor: {}, skipTurns: {}, ...row?.value };
  }

  saveRouting(tx: Prisma.TransactionClient, state: RoutingState) {
    return tx.setting.update({ where: { key: "routing" }, data: { value: state as never } });
  }

  /** Of these employees, the ones still working here, in the same order (a routing pool skips who left, 1.13). */
  async stillWorking(ids: string[], tx: Prisma.TransactionClient = this.db) {
    const active = new Set((await tx.employee.findMany({ where: { id: { in: ids }, user: { status: { not: "DISABLED" } } }, select: { id: true } })).map((e) => e.id));
    return ids.filter((id) => active.has(id));
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
  board(scope: Prisma.LeadWhereInput, f: LeadFilters, stages: readonly string[], perLane: number) {
    const where = leadWhere(scope, f);
    return Promise.all([
      this.db.lead.groupBy({ by: ["stage"], where, _count: { _all: true } }),
      Promise.all(stages.map((stage) => this.db.lead.findMany({
        where: { AND: [where, { stage: stage as Prisma.LeadWhereInput["stage"] }] }, select: LEAD_ROW, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: perLane,
      }))),
    ]);
  }

  /** How many leads each tab has under the current filters (the tab itself set aside). */
  tabCounts(scope: Prisma.LeadWhereInput, f: LeadFilters) {
    return this.db.lead.groupBy({ by: ["kind"], where: leadWhere(scope, { ...f, kind: undefined }), _count: { _all: true } });
  }

  /** One lead with its Activity (newest first). Out of the caller's scope it simply isn't found. */
  detail(scope: Prisma.LeadWhereInput, id: string) {
    return this.db.lead.findFirst({ where: { AND: [scope, { id, archivedAt: null }] }, select: LEAD_DETAIL });
  }

  /** What the client wants and the narrowing answers (2.12), when the lead is in the caller's scope. */
  clientNeed(scope: Prisma.LeadWhereInput, id: string, tx: Prisma.TransactionClient = this.db) {
    return tx.lead.findFirst({ where: { AND: [scope, { id, archivedAt: null }] }, select: { type: true, space: true, condition: true, budget: true, area: true, answers: true } });
  }

  setAnswers(tx: Prisma.TransactionClient, id: string, answers: Prisma.InputJsonValue) {
    return tx.lead.update({ where: { id }, data: { answers } });
  }

  /** The id when the lead exists and is inside the caller's scope — the same rule as reading it. */
  findInScope(scope: Prisma.LeadWhereInput, id: string, tx: Prisma.TransactionClient = this.db) {
    return tx.lead.findFirst({ where: { AND: [scope, { id, archivedAt: null }] }, select: { id: true, firstActionAt: true } });
  }

  /** Pass `tx` when called inside a transaction: a second connection there can starve the pool under load. */
  employeeNames(ids: string[], tx: Prisma.TransactionClient = this.db) {
    return tx.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }

  /** Activity is written by users; their display name lives on their HR file. */
  userNames(userIds: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } });
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

  findByPhone(phones: string[]) {
    return this.db.lead.findFirst({ where: { phones: { hasSome: phones }, archivedAt: null }, select: { id: true, code: true } });
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
  company: { select: { name: true } },
  activities: { select: { id: true, kind: true, text: true, byUserId: true, at: true }, orderBy: [{ at: "desc" }, { id: "desc" }] },
  visits: { select: { id: true, kind: true, at: true, extra: true, outcome: true, postponeStatus: true, postponeReason: true, units: { select: { unit: { select: { id: true, code: true, project: true, space: true } } } } }, orderBy: [{ at: "desc" }, { id: "desc" }] },
} satisfies Prisma.LeadSelect;
export type LeadDetailRecord = Prisma.LeadGetPayload<{ select: typeof LEAD_DETAIL }>;

/** What a line of Activity is about (the column is text; these are the kinds the flows write). */
export type ActivityKind = "comment" | "stage" | "assign" | "call" | "visit" | "meeting" | "whatsapp" | "duplicate";

const DUPLICATE_ROW = {
  id: true, at: true, byUserId: true, data: true, decidedAt: true,
  lead: { select: {
    id: true, code: true, name: true, phones: true, area: true, type: true, space: true, budget: true, channel: true, assignedToId: true,
    company: { select: { name: true } }, campaign: { select: { id: true, name: true } },
  } },
} satisfies Prisma.LeadDuplicateSelect;
export type DuplicateRecord = Prisma.LeadDuplicateGetPayload<{ select: typeof DUPLICATE_ROW }>;

function leadWhere(scope: Prisma.LeadWhereInput, f: LeadFilters): Prisma.LeadWhereInput {
  const digits = f.q?.replace(/\D/g, "") ?? "";
  return {
    AND: [scope, { archivedAt: null },
      f.stage ? { stage: f.stage.toUpperCase().replace(/ /g, "_") as Prisma.LeadWhereInput["stage"] } : {},
      f.kind ? { kind: f.kind === "broker" ? "BROKER" : "CLIENT" } : {},
      f.area ? { area: f.area } : {}, f.channel ? { channel: f.channel } : {}, f.campaignId ? { campaignId: f.campaignId } : {},
      f.assignedToId ? { assignedToId: f.assignedToId } : {}, f.qualified !== undefined ? { qualified: f.qualified } : {},
      // the whole mobile (the GIN index), any part of the name, or the code typed in any case («l-1001»)
      f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: f.q.toUpperCase() }, ...(digits.length >= 10 ? [{ phones: { has: digits } }] : [])] } : {},
      // Cairo days, «to» included: up to the start of the next day
      f.from ? { createdAt: { gte: dayStart(f.from) } } : {},
      f.to ? { createdAt: { lt: dayStart(nextDay(f.to)) } } : {}],
  };
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
