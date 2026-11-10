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
      // a postponement waiting for its decision or approved (1.24) takes it off: «لازم تدوس Done» no longer applies
      where: { outcome: null, OR: [{ postponeStatus: null }, { postponeStatus: "rejected" }], at: { lt: dayStart(nextDay(today)) }, lead: { AND: [scope, { archivedAt: null }] } },
      select: { id: true, kind: true, at: true, lead: { select: { id: true, name: true, assignedToId: true } } },
      orderBy: { at: "asc" }, take: 100,
    });
  }

  /** 1.33: this salesperson's leads with a Team Leader's note on them (the service keeps the ones not seen yet). */
  tlNotes(employeeId: string) {
    return this.db.lead.findMany({
      where: { assignedToId: employeeId, archivedAt: null, tlNote: { not: null } },
      select: { id: true, name: true, tlNote: true, tlNoteAt: true, tlNoteSeenAt: true }, orderBy: { tlNoteAt: "desc" }, take: 50,
    });
  }

  /** 1.34: the leads Telesales holds that came back to her on the rotation (backToTelesales decides). */
  telesalesBack(employeeId: string, minRotation: number) {
    return this.db.lead.findMany({
      where: { assignedToId: employeeId, ownedByTelesales: true, rotation: { gte: minRotation }, archivedAt: null },
      select: { id: true, name: true, ownedByTelesales: true, rotation: true, newLeadRequestedAt: true, newLeadRoutedAt: true },
      orderBy: { assignedAt: "asc" }, take: 50,
    });
  }

  /** 1.34: this salesperson's No Answer leads, with the mark and the last logged call (the «كلّمه» clock). */
  noAnswerLeads(employeeId: string) {
    return this.db.lead.findMany({
      where: { assignedToId: employeeId, stage: "NO_ANSWER", archivedAt: null, naMarkedAt: { not: null } },
      select: { id: true, name: true, naMarkedAt: true, calls: { select: { at: true }, orderBy: { at: "desc" }, take: 1 } },
      orderBy: { naMarkedAt: "asc" }, take: 100,
    });
  }

  /** 1.34 · 1.24: the postponements still waiting for a decision. */
  pendingPostpones() {
    return this.db.leadVisit.findMany({
      where: { outcome: null, postponeStatus: "pending", lead: { archivedAt: null } },
      select: { id: true, kind: true, at: true, postponeReason: true, lead: { select: { id: true, name: true, assignedToId: true } } },
      orderBy: { at: "asc" }, take: 100,
    });
  }

  /** 1.34 · 1.27: what waits in the Draft Admin for a decision, oldest first. */
  draftAdminWaiting() {
    return this.db.leadDraft.findMany({
      where: { kind: "admin", decidedAt: null, keptAt: null, lead: { archivedAt: null } },
      select: { at: true, fromId: true, lead: { select: { name: true, stage: true } } }, orderBy: { at: "asc" }, take: 200,
    });
  }

  employeeNames(ids: string[]) {
    return this.db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
