import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

/** 11.15 · the leads that need a Second Call, and the KPI item that says which channels are left out. */
@Injectable()
export class SecondCallsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /** This quarter's «مكالمات التحقق» item settings (the same item the daily KPI job measures), {} when there's none. */
  async itemParams(quarter: string) {
    const it = await this.db.kpiItem.findFirst({ where: { method: "system", metric: "secondCalls", card: { quarter } }, select: { params: true } });
    return it?.params ?? {};
  }

  /** The kpi-refresh job's filter: not entered by the salesperson himself, not with Telesales, not an excluded channel. */
  private where(from: Date, excluded: string[]): Prisma.LeadWhereInput {
    return { createdAt: { gte: from }, archivedAt: null, selfEntered: false, ownedByTelesales: false, channel: { notIn: excluded } };
  }

  /** Today's leads, and the earlier ones of the window still without a Second Call; newest first. */
  list(from: Date, today: Date, excluded: string[]) {
    return this.db.lead.findMany({
      where: { AND: [this.where(from, excluded), { OR: [{ createdAt: { gte: today } }, { verification: { equals: Prisma.DbNull } }] }] },
      select: ROW, orderBy: { createdAt: "desc" }, take: 500,
    });
  }

  one(tx: Prisma.TransactionClient, id: string, from: Date, excluded: string[]) {
    return tx.lead.findFirst({ where: { id, ...this.where(from, excluded) }, select: ROW });
  }

  employeeNames(ids: string[]) {
    return this.db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }

  /** Locks the lead until the transaction ends: two people pressing «Second Call Done» at once can't both write it. */
  async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT 1 FROM "sales"."Lead" WHERE "id" = ${id} FOR UPDATE`;
  }

  async done(tx: Prisma.TransactionClient, id: string, verification: Prisma.InputJsonObject, text: string, byUserId: string) {
    await tx.lead.update({ where: { id }, data: { verification } });
    await tx.leadActivity.create({ data: { leadId: id, kind: "verify", text, byUserId } });
  }
}

const ROW = { id: true, code: true, name: true, channel: true, createdAt: true, assignedToId: true, verification: true } as const;
