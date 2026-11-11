import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

type Tx = Prisma.TransactionClient | PrismaClient;
const DEAL = { include: { participants: true, payments: { select: { side: true, amount: true, receivedAt: true } } } } as const satisfies Prisma.DealDefaultArgs;
export type DealRecord = Prisma.DealGetPayload<typeof DEAL>;

/** Data access only for the scheduled reports (11.10), the daily report (11.12) and the monthly targets (11.8). */
@Injectable()
export class ReportsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  reports() {
    return this.db.scheduledReport.findMany({ orderBy: { createdAt: "asc" }, include: { runs: { orderBy: { at: "desc" }, take: 6, select: { id: true, period: true, at: true, title: true } } } });
  }

  report(id: string) {
    return this.db.scheduledReport.findUnique({ where: { id } });
  }

  daily() {
    return this.db.scheduledReport.findFirst({ where: { daily: true, on: true } });
  }

  run(id: string) {
    return this.db.reportRun.findUnique({ where: { id }, include: { report: { select: { money: true } } } });
  }

  /** Everyone active, with their roles: who a report names (pickPeople). */
  async users() {
    const rows = await this.db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, roles: { select: { role: { select: { key: true } } } }, employee: { select: { id: true, name: true } } } });
    return rows.map((u) => ({ id: u.id, roles: u.roles.map((r) => r.role.key), employeeId: u.employee?.id ?? null, name: u.employee?.name ?? "" }));
  }

  /** 11.20 · everyone active with a name, and their primary role, for «مين يشوف التقارير». */
  accessPeople() {
    return this.db.user.findMany({ where: { status: "ACTIVE", employee: { isNot: null } },
      select: { id: true, employee: { select: { name: true } }, roles: { select: { primary: true, role: { select: { key: true, label: true } } } } },
      orderBy: { employee: { name: "asc" } } });
  }

  accessList() {
    return this.db.reportsAccess.findMany({ select: { userId: true } });
  }

  roles() {
    return this.db.role.findMany({ select: { key: true, label: true }, orderBy: { label: "asc" } });
  }

  /** «المتابع بتاع الشخص»: his KPI card's follower this quarter, or his manager. */
  async followerOf(employeeId: string | null, quarter: string | undefined): Promise<string | null> {
    if (!employeeId) return null;
    const card = quarter ? await this.db.kpiCard.findUnique({ where: { quarter_employeeId: { quarter, employeeId } }, select: { follower: { select: { userId: true } } } }) : null;
    if (card?.follower) return card.follower.userId;
    return (await this.db.employee.findUnique({ where: { id: employeeId }, select: { manager: { select: { userId: true } } } }))?.manager?.userId ?? null;
  }

  /** The people I follow (11.12 «الـ TL بيشوف فريقه بس»): my cards this quarter, my reports, my sales team. User ids. */
  async followedBy(employeeId: string | null, quarter: string | undefined): Promise<string[]> {
    if (!employeeId) return [];
    const rows = await this.db.employee.findMany({
      where: { OR: [{ managerId: employeeId }, { teamLeaderId: employeeId }, ...(quarter ? [{ kpiCards: { some: { quarter, followerId: employeeId } } }] : [])] },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  /** The latest hand-ins of a report, newest first. */
  recentHandIns(reportId: string, take: number) {
    return this.db.reportHandIn.findMany({ where: { reportId, at: { not: null } }, orderBy: { at: "desc" }, take, select: { period: true, at: true, note: true, userId: true } });
  }

  handIns(reportId: string, period: string) {
    return this.db.reportHandIn.findMany({ where: { reportId, period, at: { not: null } }, select: { userId: true, at: true } });
  }

  handInsOf(userId: string, periods: string[]) {
    return this.db.reportHandIn.findMany({ where: { userId, period: { in: periods }, at: { not: null } }, select: { reportId: true, period: true } });
  }

  /** Report-method items of this quarter's cards: what a report can count in. */
  reportItems(quarter: string) {
    return this.db.kpiItem.findMany({ where: { method: "report", card: { quarter } }, select: { id: true, title: true, report: true, card: { select: { employee: { select: { name: true } } } } }, orderBy: { title: "asc" } });
  }

  linkedItem(reportId: string, employeeId: string, quarter: string, tx: Tx = this.db) {
    return tx.kpiItem.findFirst({ where: { report: reportId, card: { employeeId, quarter } }, select: { id: true, title: true, required: true, _count: { select: { deliveries: true } } } });
  }

  // ───────── 11.12 ─────────

  dailyReports(userId: string, from: Date, to: Date, tx: Tx = this.db) {
    return tx.dailyReport.findMany({ where: { userId, day: { gte: from, lte: to } }, orderBy: { day: "asc" } });
  }

  dailyOn(userIds: string[], day: Date) {
    return this.db.dailyReport.findMany({ where: { userId: { in: userIds }, day }, select: { userId: true } });
  }

  fields(userId: string) {
    return this.db.dailyReportField.findMany({ where: { userId }, orderBy: { position: "asc" } });
  }

  field(id: string) {
    return this.db.dailyReportField.findUnique({ where: { id } });
  }

  /** What the system counts for one person in [from, to): the daily report fills these by itself (demo DAY_AUTO). */
  count(metric: string, p: { id: string; employeeId: string | null }, from: Date, to: Date, params: Record<string, unknown>): Promise<number> | null {
    const at = { gte: from, lt: to };
    if (metric === "calls") return this.db.leadCall.count({ where: { byUserId: p.id, at } });
    if (metric === "visitsDone") return this.db.leadVisit.count({ where: { byUserId: p.id, outcome: "done", at, ...(params.kind ? { kind: String(params.kind).toLowerCase() } : {}) } });
    if (metric === "dealsCount") return this.db.dealParticipant.count({ where: { employeeId: p.employeeId ?? "-", side: "BUYER", deal: { closedAt: at, status: { notIn: ["REJECTED", "CANCELLED"] } } } });
    return null;
  }

  // ───────── 11.8 ─────────

  /** Active salespeople in the data scope, with their TL. */
  salespeople(where: Prisma.EmployeeWhereInput, tx: Tx = this.db) {
    return tx.employee.findMany({
      where: { ...where, user: { status: "ACTIVE", roles: { some: { role: { key: "sales" } } } } },
      select: { id: true, userId: true, name: true, team: true, target: true, teamLeaderId: true, teamLeader: { select: { id: true, name: true, team: true } } },
      orderBy: { name: "asc" },
    });
  }

  targets(month: string, employeeIds: string[], tx: Tx = this.db) {
    return tx.salesTarget.findMany({ where: { month, employeeId: { in: employeeIds } } });
  }

  /**
   * Deals of these people with a collection in [from, to), with all their payments (the first collection decides the Transaction).
   * A cancelled deal is left out: it drops out of the achievements and «الـ Transactions» list (M-02 2.3 (12) · 5.7).
   */
  deals(employeeIds: string[], from: Date, to: Date, tx: Tx = this.db): Promise<DealRecord[]> {
    return tx.deal.findMany({ where: { status: { not: "CANCELLED" }, participants: { some: { employeeId: { in: employeeIds } } }, payments: { some: { receivedAt: { gte: from, lt: to } } } }, ...DEAL, orderBy: { closedAt: "asc" } });
  }

  /** The month's visits and meetings done, per person and kind (visit · meeting). */
  visits(userIds: string[], from: Date, to: Date) {
    return this.db.leadVisit.groupBy({ by: ["byUserId", "kind"], where: { byUserId: { in: userIds }, outcome: "done", at: { gte: from, lt: to } }, _count: { _all: true } });
  }

  /** Achievements «Inventory»: the units each salesperson brought (their agent) entered in the month. */
  unitsBrought(employeeIds: string[], from: Date, to: Date) {
    return this.db.unit.groupBy({ by: ["agentId"], where: { agentId: { in: employeeIds }, archivedAt: null, enteredAt: { gte: from, lt: to } }, _count: { _all: true } });
  }

  /** Achievements «Farming» · «Approach»: the activities done in the month (نشاطاتي). */
  activitiesDone(employeeIds: string[], from: Date, to: Date) {
    return this.db.salesActivity.groupBy({ by: ["employeeId", "kind"], where: { employeeId: { in: employeeIds }, status: "done", at: { gte: from, lt: to } }, _count: { _all: true } });
  }

  async setting(key: string): Promise<unknown> {
    return (await this.db.setting.findUnique({ where: { key } }))?.value ?? null;
  }

  employeeNames(ids: string[]) {
    return this.db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }
}
