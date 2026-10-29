import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { LeadFilters } from "@places/contracts";
import { dayStart } from "@places/domain";
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

  employeeNames(ids: string[]) {
    return this.db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }

  findByPhone(phones: string[]) {
    return this.db.lead.findFirst({ where: { phones: { hasSome: phones }, archivedAt: null }, select: { id: true, code: true } });
  }

  salesForArea(area: string) {
    return this.db.setting.findUnique({ where: { key: `routing:${area}` } });
  }

  nextCode(tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('sales.lead_code_seq') AS n`; // created by a migration
  }
}

const LEAD_ROW = {
  id: true, code: true, name: true, phones: true, area: true, type: true, channel: true, stage: true, qualified: true, touched: true,
  assignedToId: true, assignedAt: true, arrivedAt: true, createdAt: true, campaign: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;
export type LeadRecord = Prisma.LeadGetPayload<{ select: typeof LEAD_ROW }>;

function leadWhere(scope: Prisma.LeadWhereInput, f: LeadFilters): Prisma.LeadWhereInput {
  const digits = f.q?.replace(/\D/g, "") ?? "";
  return {
    AND: [scope, { archivedAt: null },
      f.stage ? { stage: f.stage.toUpperCase().replace(/ /g, "_") as Prisma.LeadWhereInput["stage"] } : {},
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
