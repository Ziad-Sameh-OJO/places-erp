import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

/** A lead as the list counts it (1.26 · 1.28): not archived, not in a Draft tab, the «الليدز» tab (not the brokers'). */
const listed = (scope: Prisma.LeadWhereInput): Prisma.LeadWhereInput => ({ AND: [scope, { archivedAt: null, draft: null, kind: "CLIENT" }] });
/** A Visit / Meeting that happened (or is still to be marked): one marked «ما اتعملتش» doesn't count. */
const held: Prisma.LeadVisitWhereInput = { OR: [{ outcome: null }, { outcome: { not: "not_done" } }] };

/**
 * 14.1–14.3 · data access only, and read only: counts over the tables the other modules own. The caller's data scope
 * is part of every lead query (never filtered afterwards); what needs a module's rules (targets, money, the ideal
 * employee) comes from that module's service instead.
 */
@Injectable()
export class DashboardRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  async layoutOf(userId: string): Promise<string | null> {
    return (await this.db.user.findUnique({ where: { id: userId }, select: { dashboard: true } }))?.dashboard ?? null;
  }

  /** Leads that came in since `from`, and how many of them are Qualified (Interested at least once). */
  leadsSince(scope: Prisma.LeadWhereInput, from: Date, to?: Date) {
    const where = listed({ AND: [scope, { createdAt: { gte: from, ...(to ? { lt: to } : {}) } }] });
    return Promise.all([this.db.lead.count({ where }), this.db.lead.count({ where: { AND: [where, { qualified: true }] } })]);
  }

  stageCounts(scope: Prisma.LeadWhereInput, stages: readonly string[]) {
    return this.db.lead.groupBy({ by: ["stage"], where: { AND: [listed(scope), { stage: { in: stages as never } }] }, _count: { _all: true } });
  }

  /** Visits and Meetings in [from, to): on the leads in scope, or by one person. */
  visits(by: { leads: Prisma.LeadWhereInput } | { userId: string }, from: Date, to: Date) {
    const who: Prisma.LeadVisitWhereInput = "userId" in by ? { byUserId: by.userId } : { lead: by.leads };
    return this.db.leadVisit.groupBy({ by: ["kind"], where: { AND: [who, held, { at: { gte: from, lt: to } }] }, _count: { _all: true } });
  }

  /** Done Deals registered in [from, to): a rejected or cancelled one doesn't count. */
  dealsClosed(from: Date, to: Date) {
    return this.db.deal.count({ where: { closedAt: { gte: from, lt: to }, status: { notIn: ["REJECTED", "CANCELLED"] } } });
  }

  unitsAdded(from: Date, to?: Date) {
    return this.db.unit.count({ where: { createdAt: { gte: from, ...(to ? { lt: to } : {}) }, archivedAt: null } });
  }

  /** Visits and Meetings in [from, to) by who made them (the teams' table). */
  visitsByPerson(from: Date, to: Date) {
    return this.db.leadVisit.groupBy({ by: ["byUserId", "kind"], where: { AND: [held, { at: { gte: from, lt: to } }] }, _count: { _all: true } });
  }

  /** The Done Deals each salesperson is on (buyer or seller side), closed in [from, to), not rejected or cancelled. */
  dealsByPerson(from: Date, to: Date) {
    return this.db.dealParticipant.groupBy({ by: ["employeeId"], where: { deal: { closedAt: { gte: from, lt: to }, status: { notIn: ["REJECTED", "CANCELLED"] } } }, _count: { _all: true } });
  }

  /** The commission that came in [from, to): the deals' payments (a cancelled or rejected deal's don't count). */
  async collected(from: Date, to: Date): Promise<string> {
    const r = await this.db.payment.aggregate({ where: { receivedAt: { gte: from, lt: to }, deal: { status: { notIn: ["REJECTED", "CANCELLED"] } } }, _sum: { amount: true } });
    return r._sum.amount?.toFixed(2) ?? "0.00";
  }

  /** Fresh leads with a salesperson and no action yet: the ones the SLA clock runs on. */
  slaRunning(scope: Prisma.LeadWhereInput) {
    return this.db.lead.findMany({
      where: listed({ AND: [scope, { stage: "FRESH", touched: false, ownedByTelesales: false, assignedAt: { not: null } }] }),
      select: { stage: true, touched: true, ownedByTelesales: true, assignedAt: true },
    });
  }

  /** Near to Close with no stage change since `before`. */
  staleNearClose(scope: Prisma.LeadWhereInput, before: Date) {
    return this.db.lead.count({ where: listed({ AND: [scope, { stage: "NEAR_TO_CLOSE", activities: { none: { kind: "stage", at: { gte: before } } } }] }) });
  }

  pendingDeals() {
    return this.db.deal.count({ where: { status: "PENDING_REVIEW" } });
  }

  /** The salespeople a lead was pulled from by the SLA since `from` (the worker's «auto-pull» audit rows). */
  async pulledFrom(from: Date): Promise<string[]> {
    const rows = await this.db.auditLog.findMany({ where: { action: "auto-pull", entity: "Lead", at: { gte: from } }, select: { before: true } });
    const ids = [...new Set(rows.flatMap((r) => {
      const b = r.before;
      return b && typeof b === "object" && !Array.isArray(b) && typeof b.assignedToId === "string" ? [b.assignedToId] : [];
    }))];
    return this.names(ids);
  }

  /** A day's late check-ins with their kind (the caller keeps those without an Excuse). */
  lateOn(day: string) {
    return this.db.attendanceDay.findMany({
      where: { day: new Date(`${day}T00:00:00Z`), lateMinutes: { gt: 0 } },
      select: { kind: true, lateMinutes: true, employee: { select: { name: true } } }, orderBy: { lateMinutes: "desc" },
    });
  }

  campaigns() {
    return this.db.campaign.findMany({ where: { archivedAt: null }, select: { id: true, name: true, channel: true, startsOn: true, endsOn: true }, orderBy: { startsOn: "desc" } });
  }

  async names(employeeIds: string[]): Promise<string[]> {
    if (!employeeIds.length) return [];
    return (await this.db.employee.findMany({ where: { id: { in: employeeIds } }, select: { name: true }, orderBy: { name: "asc" } })).map((e) => e.name);
  }
}
