import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

export const CARD = {
  include: {
    employee: { select: { id: true, name: true, jobTitle: true, salary: true, userId: true } },
    follower: { select: { id: true, name: true } },
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

  log(take: number) {
    return this.db.auditLog.findMany({ where: { module: "kpis" }, orderBy: { at: "desc" }, take });
  }

  names(userIds: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } });
  }
}
