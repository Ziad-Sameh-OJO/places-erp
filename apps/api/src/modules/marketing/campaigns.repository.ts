import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

/** Data access only. Archived campaigns are gone from the screen; leads keep pointing at them. */
@Injectable()
export class CampaignsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list() {
    return this.db.campaign.findMany({ where: { archivedAt: null }, orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }] });
  }

  find(id: string) {
    return this.db.campaign.findFirst({ where: { id, archivedAt: null } });
  }

  /** Every arrival per campaign, duplicates too (M-04 Q22), and how many of them are Qualified leads. */
  async counts(ids: string[]): Promise<Map<string, { leads: number; qualified: number }>> {
    const [all, qualified] = await Promise.all([
      this.db.leadArrival.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids } }, _count: { _all: true } }),
      this.db.leadArrival.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, lead: { qualified: true } }, _count: { _all: true } }),
    ]);
    const q = new Map(qualified.map((r) => [r.campaignId, r._count._all]));
    return new Map(all.map((r) => [r.campaignId!, { leads: r._count._all, qualified: q.get(r.campaignId) ?? 0 }]));
  }

  create(tx: Prisma.TransactionClient, data: Prisma.CampaignUncheckedCreateInput) {
    return tx.campaign.create({ data });
  }

  update(tx: Prisma.TransactionClient, id: string, data: Prisma.CampaignUncheckedUpdateInput) {
    return tx.campaign.update({ where: { id }, data });
  }
}
