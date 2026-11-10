import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

export const CARD = {
  include: {
    employee: { select: { id: true, name: true, jobTitle: true, salary: true, userId: true, user: { select: { email: true } } } },
    follower: { select: { id: true, name: true, userId: true } },
    items: { orderBy: { position: "asc" }, include: { deliveries: { orderBy: { at: "asc" } } } },
  },
} as const satisfies Prisma.KpiCardDefaultArgs;
export type CardRecord = Prisma.KpiCardGetPayload<typeof CARD>;
type Tx = Prisma.TransactionClient | PrismaClient;

/** Data access only for the KPI cards (M-12). */
@Injectable()
export class KpisRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /** The latest quarter is the current one (11.11). */
  currentQuarter(tx: Tx = this.db) {
    return tx.kpiQuarter.findFirst({ orderBy: { id: "desc" } });
  }

  quarters() {
    return this.db.kpiQuarter.findMany({ orderBy: { id: "desc" } });
  }

  /** The current quarter's «أوتوماتيك» items that hold Operations' clocks (11.15), in a stable order. */
  async leadClockItems() {
    const q = await this.currentQuarter();
    if (!q) return [];
    return this.db.kpiItem.findMany({ where: { method: "system", metric: { in: ["newLeadRoute", "draftAction"] }, card: { quarter: q.id } },
      select: { metric: true, params: true }, orderBy: [{ card: { employee: { name: "asc" } } }, { position: "asc" }] });
  }

  quarterStats() {
    return this.db.kpiCard.groupBy({ by: ["quarter"], _count: { _all: true }, _avg: { finalScore: true } });
  }

  cards(where: Prisma.KpiCardWhereInput, tx: Tx = this.db) {
    return tx.kpiCard.findMany({ where, ...CARD, orderBy: { employee: { name: "asc" } } });
  }

  card(id: string, tx: Tx = this.db) {
    return tx.kpiCard.findUnique({ where: { id }, ...CARD });
  }

  cardOf(quarter: string, employeeId: string, tx: Tx = this.db) {
    return tx.kpiCard.findUnique({ where: { quarter_employeeId: { quarter, employeeId } }, ...CARD });
  }

  async bands(tx: Tx = this.db) {
    return (await tx.kpiBands.findUnique({ where: { id: "default" } })) ?? (await tx.kpiBands.create({ data: {} }));
  }

  /** 11.18 · the award rules, smallest first. */
  bonusRules(tx: Tx = this.db) {
    return tx.kpiBonusRule.findMany({ orderBy: [{ minPct: "asc" }, { createdAt: "asc" }] });
  }

  /** 11.18 · what the quarterly sheet reads off one employee: his scheme, his monthly targets and his deals paid in [from, to). */
  async sheetMoney(employeeId: string, months: readonly string[], from: Date, to: Date) {
    const [e, targets, deals] = await Promise.all([
      this.db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { target: true, commissionPct: true } }),
      this.db.salesTarget.findMany({ where: { employeeId, month: { in: [...months] } } }),
      this.db.deal.findMany({ where: { participants: { some: { employeeId } }, payments: { some: { receivedAt: { gte: from, lt: to } } } }, include: { participants: true, payments: true } }),
    ]);
    return { ...e, targets, deals };
  }

  async watchers(): Promise<unknown> {
    return (await this.db.setting.findUnique({ where: { key: "kpiWatch" } }))?.value ?? [];
  }

  setWatchers(userIds: string[], tx: Tx) {
    return tx.setting.upsert({ where: { key: "kpiWatch" }, create: { key: "kpiWatch", value: userIds }, update: { value: userIds } });
  }

  /** Everyone still working here (not disabled), for the pickers and «موظفين من غير كارت». */
  people() {
    return this.db.employee.findMany({ where: { user: { status: { not: "DISABLED" } } }, select: { id: true, userId: true, name: true, jobTitle: true }, orderBy: { name: "asc" } });
  }

  roles() {
    return this.db.role.findMany({ select: { key: true, label: true }, orderBy: { label: "asc" } });
  }

  employee(id: string) {
    return this.db.employee.findUnique({ where: { id }, select: { id: true, name: true } });
  }

  delivery(id: string) {
    return this.db.kpiDelivery.findUnique({ where: { id }, include: { item: { select: { cardId: true } } } });
  }

  /** An item's `report` is a scheduled report's id (11.10): the card shows its name. */
  reportNames() {
    return this.db.scheduledReport.findMany({ select: { id: true, name: true } });
  }

  log(take: number) {
    return this.db.auditLog.findMany({ where: { module: "kpis" }, orderBy: { at: "desc" }, take });
  }

  finalScores(quarter: string) {
    return this.db.kpiCard.findMany({ where: { quarter, finalScore: { not: null } }, select: { employeeId: true, finalScore: true } });
  }

  /** 11.6: the KPI amounts of the quarters closed in [from, to), for that month's payroll line. */
  async closedAmounts(from: Date, to: Date, tx: Tx = this.db) {
    const quarters = await tx.kpiQuarter.findMany({ where: { status: "closed", closedAt: { gte: from, lt: to } }, select: { id: true } });
    if (!quarters.length) return [];
    return tx.kpiCard.findMany({ where: { quarter: { in: quarters.map((q) => q.id) }, finalAmount: { not: null } }, select: { employeeId: true, finalAmount: true } });
  }

  /** 11.13: the person's latest Farming / Approach. */
  activities(employeeId: string) {
    return this.db.salesActivity.findMany({ where: { employeeId }, orderBy: { at: "desc" }, take: 6 });
  }

  activity(id: string) {
    return this.db.salesActivity.findUnique({ where: { id } });
  }

  /** Does the person's card this quarter count Farming / Approach, and who follows it. */
  activityCard(quarter: string, employeeId: string) {
    return this.db.kpiCard.findUnique({
      where: { quarter_employeeId: { quarter, employeeId } },
      select: { follower: { select: { userId: true } }, items: { where: { metric: "activitiesDone" }, select: { id: true } } },
    });
  }

  names(userIds: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } });
  }

  /** 11.15 · the New Lead requests this person routed, and the ones still waiting (same rows as the daily job). */
  async newLeadTasks(from: Date, userId: string) {
    const l = await this.db.lead.findMany({
      where: { archivedAt: null, newLeadRequestedAt: { gte: from }, OR: [{ newLeadRoutedById: null }, { newLeadRoutedById: userId }] },
      select: { name: true, newLeadRequestedAt: true, newLeadRoutedAt: true },
    });
    return l.map((x) => ({ name: x.name, at: x.newLeadRequestedAt!, doneAt: x.newLeadRoutedAt }));
  }

  /** 11.15 · every Draft / Draft Admin stay since `from`; «يفضل» or sending it on, whichever came first, is the decision. */
  async draftTasks(from: Date) {
    const d = await this.db.leadDraft.findMany({ where: { at: { gte: from } }, select: { kind: true, at: true, keptAt: true, decidedAt: true, lead: { select: { name: true } } } });
    return d.map((x) => ({ name: x.lead.name, tag: x.kind === "admin" ? "Draft Admin" : "Draft", at: x.at, doneAt: x.keptAt ?? x.decidedAt }));
  }
}
