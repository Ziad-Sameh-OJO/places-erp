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
  leadsSince(scope: Prisma.LeadWhereInput, from: Date) {
    const where = listed({ AND: [scope, { createdAt: { gte: from } }] });
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

  unitsAdded(from: Date) {
    return this.db.unit.count({ where: { createdAt: { gte: from }, archivedAt: null } });
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
