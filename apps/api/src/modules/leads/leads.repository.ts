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

  /** One lead with its Activity (newest first). Out of the caller's scope it simply isn't found. */
  detail(scope: Prisma.LeadWhereInput, id: string) {
    return this.db.lead.findFirst({ where: { AND: [scope, { id, archivedAt: null }] }, select: LEAD_DETAIL });
  }

  /** The id when the lead exists and is inside the caller's scope — the same rule as reading it. */
  findInScope(scope: Prisma.LeadWhereInput, id: string, tx: Prisma.TransactionClient = this.db) {
    return tx.lead.findFirst({ where: { AND: [scope, { id, archivedAt: null }] }, select: { id: true, firstActionAt: true } });
  }

  /** Pass `tx` when called inside a transaction: a second connection there can starve the pool under load. */
  employeeNames(ids: string[], tx: Prisma.TransactionClient = this.db) {
    return tx.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }

  /** Activity is written by users; their display name lives on their HR file. */
  userNames(userIds: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } });
  }

  addActivity(tx: Prisma.TransactionClient, leadId: string, kind: ActivityKind, text: string, byUserId: string | null) {
    return tx.leadActivity.create({ data: { leadId, kind, text, byUserId } });
  }

  /** Any action by the salesperson stops the SLA clock (M-01 «3 ساعات من غير أي أكشن»); only the first one is kept. */
  markActed(tx: Prisma.TransactionClient, id: string, at: Date) {
    return tx.lead.updateMany({ where: { id, firstActionAt: null }, data: { firstActionAt: at, touched: true } });
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

const LEAD_DETAIL = {
  ...LEAD_ROW, space: true, condition: true, budget: true, note: true, noAnswerCount: true, rotation: true, firstActionAt: true,
  company: { select: { name: true } },
  activities: { select: { id: true, kind: true, text: true, byUserId: true, at: true }, orderBy: [{ at: "desc" }, { id: "desc" }] },
} satisfies Prisma.LeadSelect;
export type LeadDetailRecord = Prisma.LeadGetPayload<{ select: typeof LEAD_DETAIL }>;

/** What a line of Activity is about (the column is text; these are the kinds the flows write). */
export type ActivityKind = "comment" | "stage" | "assign" | "call" | "visit" | "meeting" | "whatsapp";

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
