import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

/** A campaign with the units it targets (4.20). */
export const CAMPAIGN = { include: { units: { select: { unit: { select: { id: true, code: true, project: true } } } } } } as const satisfies Prisma.CampaignDefaultArgs;

/** Data access only. Archived campaigns are gone from the screen; leads keep pointing at them. */
@Injectable()
export class CampaignsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list() {
    return this.db.campaign.findMany({ where: { archivedAt: null }, orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }], ...CAMPAIGN });
  }

  find(id: string) {
    return this.db.campaign.findFirst({ where: { id, archivedAt: null }, ...CAMPAIGN });
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

  /** The dashboard: every arrival in the filter (duplicates too, Q22), with its lead's Qualified mark and post. */
  arrivals(where: Prisma.LeadArrivalWhereInput) {
    return this.db.leadArrival.findMany({ where, select: { channel: true, campaignId: true, lead: { select: { qualified: true, post: true } } } });
  }

  /** Name, target and cost of these campaigns (archived ones too: their old leads still count). */
  byIds(ids: string[]) {
    return this.db.campaign.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, target: true, spent: true } });
  }

  /** The campaigns the filter covers, for «صرف الكامبينز». */
  covered(where: Prisma.CampaignWhereInput) {
    return this.db.campaign.findMany({ where: { AND: [where, { archivedAt: null }] }, select: { spent: true } });
  }

  /** 4.19 · «أسماء الصفحات», in the order they were added, with how many live campaigns use each. */
  async pages() {
    const [rows, used] = await Promise.all([
      this.db.campaignPage.findMany({ orderBy: { createdAt: "asc" } }),
      this.db.campaign.groupBy({ by: ["page"], where: { archivedAt: null, page: { not: null } }, _count: { _all: true } }),
    ]);
    const n = new Map(used.map((u) => [u.page, u._count._all]));
    return rows.map((p) => ({ id: p.id, name: p.name, campaigns: n.get(p.name) ?? 0 }));
  }

  page(id: string) {
    return this.db.campaignPage.findUnique({ where: { id } });
  }

  addPage(tx: Prisma.TransactionClient, name: string) {
    return tx.campaignPage.create({ data: { name } });
  }

  /** A rename moves every campaign on the old name to the new one (archived ones too: same page). */
  async renamePage(tx: Prisma.TransactionClient, id: string, from: string, to: string) {
    await tx.campaignPage.update({ where: { id }, data: { name: to } });
    return (await tx.campaign.updateMany({ where: { page: from }, data: { page: to } })).count;
  }

  removePage(tx: Prisma.TransactionClient, id: string) {
    return tx.campaignPage.delete({ where: { id } });
  }

  create(tx: Prisma.TransactionClient, data: Prisma.CampaignUncheckedCreateInput) {
    return tx.campaign.create({ data });
  }

  /** 4.20 · the units it targets, as picked now. */
  async setUnits(tx: Prisma.TransactionClient, campaignId: string, unitIds: string[]) {
    await tx.campaignUnit.deleteMany({ where: { campaignId } });
    if (unitIds.length) await tx.campaignUnit.createMany({ data: unitIds.map((unitId) => ({ campaignId, unitId })) });
  }

  update(tx: Prisma.TransactionClient, id: string, data: Prisma.CampaignUncheckedUpdateInput) {
    return tx.campaign.update({ where: { id }, data });
  }
}
