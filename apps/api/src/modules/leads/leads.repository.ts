import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { LeadFilters } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";

/**
 * Data access only: queries and writes, no business decisions. Keeping Prisma here means the service reads like
 * the requirements and the queries can be tuned (indexes, selects) without touching the rules.
 */
@Injectable()
export class LeadsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list(scope: Prisma.LeadWhereInput, f: LeadFilters) {
    const where: Prisma.LeadWhereInput = {
      AND: [scope, { archivedAt: null },
        f.stage ? { stage: f.stage.toUpperCase().replace(/ /g, "_") as Prisma.LeadWhereInput["stage"] } : {},
        f.area ? { area: f.area } : {}, f.channel ? { channel: f.channel } : {}, f.campaignId ? { campaignId: f.campaignId } : {},
        f.assignedToId ? { assignedToId: f.assignedToId } : {}, f.qualified !== undefined ? { qualified: f.qualified } : {},
        f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { phones: { has: f.q.replace(/\D/g, "") } }, { code: f.q }] } : {},
        f.from || f.to ? { createdAt: { gte: f.from, lte: f.to } } : {}],
    };
    return this.db.$transaction([
      this.db.lead.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.lead.count({ where }),
    ]);
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
