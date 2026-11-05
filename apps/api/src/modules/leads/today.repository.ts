import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { dayStart } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

/** «مهامي النهارده» (1.22): the leads the SLA clock runs on, and the visits due by the end of today, inside the scope. */
@Injectable()
export class LeadsTodayRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  slaCandidates(scope: Prisma.LeadWhereInput) {
    return this.db.lead.findMany({
      where: { AND: [scope, { archivedAt: null, stage: "FRESH", touched: false, ownedByTelesales: false, assignedAt: { not: null } }] },
      select: { id: true, name: true, stage: true, touched: true, ownedByTelesales: true, assignedAt: true, assignedToId: true },
      orderBy: { assignedAt: "asc" }, take: 200,
    });
  }

  /** Planned (not marked Done / معملتهاش yet) and dated before tomorrow, Cairo days. */
  dueVisits(scope: Prisma.LeadWhereInput, today: string) {
    return this.db.leadVisit.findMany({
      where: { outcome: null, at: { lt: dayStart(nextDay(today)) }, lead: { AND: [scope, { archivedAt: null }] } },
      select: { id: true, kind: true, at: true, lead: { select: { id: true, name: true, assignedToId: true } } },
      orderBy: { at: "asc" }, take: 100,
    });
  }

  employeeNames(ids: string[]) {
    return this.db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
