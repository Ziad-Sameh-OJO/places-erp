import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

type Tx = Prisma.TransactionClient | PrismaClient;

/** 1.19 · the bulk entry's data: the requests, today's salespeople, the mobiles we already have, the new leads. */
@Injectable()
export class LeadBulkRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  campaignOf(id: string, channel: string) {
    return this.db.campaign.findFirst({ where: { id, channel }, select: { id: true } });
  }

  /** The mobiles (of these) that are already on a lead, and that lead: they don't become new leads. */
  async existingPhones(numbers: string[], tx: Tx = this.db): Promise<Map<string, string>> {
    if (!numbers.length) return new Map();
    const rows = await tx.lead.findMany({ where: { phones: { hasSome: numbers }, archivedAt: null }, select: { id: true, phones: true } });
    const wanted = new Set(numbers);
    return new Map(rows.flatMap((r) => r.phones.filter((p) => wanted.has(p)).map((p) => [p, r.id] as const)));
  }

  pending() {
    return this.db.leadBulk.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, select: BULK });
  }

  /** The pending request, locked until the transaction ends: two approvals at once must not both distribute it. */
  async lockPending(tx: Prisma.TransactionClient, id: string) {
    const [row] = await tx.$queryRaw<Array<{ status: string }>>`SELECT "status" FROM "sales"."LeadBulk" WHERE "id" = ${id} FOR UPDATE`;
    if (!row) throw new NotFoundException("الطلب ده مش موجود");
    if (row.status !== "pending") throw new ConflictException("الطلب ده اتقرر خلاص");
    return tx.leadBulk.findUniqueOrThrow({ where: { id }, select: BULK });
  }

  /** Everyone with the sales role, still working here (the routing's people); today's order comes from the rotation (1.23). */
  salespeople(tx: Tx = this.db) {
    return tx.employee.findMany({
      where: { user: { status: { not: "DISABLED" }, roles: { some: { role: { key: "sales" } } } } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
  }

  async userNames(userIds: string[]) {
    const rows = await this.db.employee.findMany({ where: { userId: { in: [...new Set(userIds)] } }, select: { userId: true, name: true } });
    return new Map(rows.map((r) => [r.userId, r.name]));
  }

  async userIdsOf(employeeIds: string[]) {
    const rows = await this.db.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, userId: true } });
    return new Map(rows.map((r) => [r.id, r.userId]));
  }

  /** The new leads, their arrival for the channel / campaign and the first Activity line, in one go. */
  async createLeads(tx: Prisma.TransactionClient, items: Array<{ phone: string; to: string }>, d: { name: string; channel: string; campaignId: string | null; byUserId: string }) {
    if (!items.length) return [];
    const codes = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('sales.lead_code_seq') AS n FROM generate_series(1, ${items.length}::int)`;
    const now = new Date();
    const leads = await tx.lead.createManyAndReturn({
      data: items.map((x, i) => ({
        code: `L-${codes[i]!.n}`, name: d.name, phones: [x.phone], area: "", type: "", channel: d.channel, campaignId: d.campaignId,
        assignedToId: x.to, assignedAt: now, createdById: d.byUserId, note: "إدخال جماعي",
      })),
      select: { id: true },
    });
    await tx.leadArrival.createMany({ data: leads.map((l) => ({ leadId: l.id, channel: d.channel, campaignId: d.campaignId, duplicate: false, byUserId: d.byUserId })) });
    await tx.leadActivity.createMany({ data: leads.map((l) => ({ leadId: l.id, kind: "assign", text: "اتوزع من إدخال جماعي بموافقة الأوبريشن", byUserId: d.byUserId })) });
    return leads;
  }

  /** A number we already have still counts for this channel / campaign (M-04 Q22), as a duplicate arrival. */
  duplicateArrivals(tx: Prisma.TransactionClient, leadIds: string[], d: { channel: string; campaignId: string | null; byUserId: string }) {
    return tx.leadArrival.createMany({ data: [...new Set(leadIds)].map((leadId) => ({ leadId, channel: d.channel, campaignId: d.campaignId, duplicate: true, byUserId: d.byUserId })) });
  }
}

const BULK = {
  id: true, numbers: true, channel: true, campaignId: true, excluded: true, byUserId: true, createdAt: true,
  campaign: { select: { id: true, name: true } },
} as const;
