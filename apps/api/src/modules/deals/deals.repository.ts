import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CostCenterFilters, DealFilters, Page } from "@places/contracts";
import { dayStart } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

const PERSON = { select: { id: true, name: true } } as const;
export const DEAL_ROW = {
  id: true, code: true, company: true, location: true, space: true, type: true, status: true, commissionOwner: true, commissionClient: true,
  closedAt: true, offTarget: true, note: true, targetBase: true, execDueAt: true, executedAt: true, papersOk: true, papersNote: true,
  unit: { select: { id: true, code: true } },
  participants: { select: { side: true, approved: true, employee: PERSON }, orderBy: { employee: { name: "asc" } } },
  payments: { select: { receivedAt: true }, orderBy: { receivedAt: "asc" }, take: 1 }, // 3.2 «Date» = the first collection's month
  tcrs: { select: { code: true }, orderBy: { code: "asc" } },
} satisfies Prisma.DealSelect;
const TCR = {
  id: true, code: true, payment: { select: { side: true, amount: true, receivedAt: true } },
  signatures: { select: { employeeId: true, signedAt: true } },
} satisfies Prisma.TcrSelect;
const DEAL_DETAIL = {
  ...DEAL_ROW, leadId: true, source: true, externalCommission: true, reviewNote: true, reviewedById: true, reviewedAt: true, createdAt: true, createdById: true,
  lead: { select: { code: true, name: true } },
  tcrs: { select: TCR, orderBy: { code: "asc" } },
} satisfies Prisma.DealSelect;
export type DealRowRecord = Prisma.DealGetPayload<{ select: typeof DEAL_ROW }>;
export type DealRecord = Prisma.DealGetPayload<{ select: typeof DEAL_DETAIL }>;

export const LOGO = "DealLogo";
const MARKETING_ROW = { id: true, code: true, company: true, type: true, space: true, location: true, lead: { select: { name: true } } } satisfies Prisma.DealSelect;

/** The roles that close deals and can stand on the Buyer side («حد معاك في الديل Buyer؟»). */
const DEAL_MAKERS = ["sales", "tl"] as const;

/** Prisma only (M-02). The data scope comes in as a `where` built by the service. */
@Injectable()
export class DealsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list(scope: Prisma.DealWhereInput, f: DealFilters, status: string | undefined, byLocation = true) {
    const where: Prisma.DealWhereInput = { AND: [scope, status ? { status: status as never } : {}, search(f.q, byLocation)] };
    return this.db.$transaction([
      this.db.deal.findMany({ where, select: DEAL_ROW, orderBy: [{ closedAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.deal.count({ where }),
    ]);
  }

  detail(scope: Prisma.DealWhereInput, id: string, tx: Prisma.TransactionClient = this.db) {
    return tx.deal.findFirst({ where: { AND: [scope, { id }] }, select: DEAL_DETAIL });
  }

  nextCode(tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('sales.deal_code_seq') AS n`; // created by the 5.1 migration
  }

  create(tx: Prisma.TransactionClient, data: Prisma.DealUncheckedCreateInput) {
    return tx.deal.create({ data, select: { id: true } });
  }

  update(tx: Prisma.TransactionClient, id: string, data: Prisma.DealUncheckedUpdateInput) {
    return tx.deal.update({ where: { id }, data, select: { id: true } });
  }

  /** The Office Manager corrected the Buyer side: the new list replaces the old one. */
  async setBuyers(tx: Prisma.TransactionClient, dealId: string, buyers: string[]) {
    await tx.dealParticipant.deleteMany({ where: { dealId, OR: [{ side: "BUYER" }, { employeeId: { in: buyers } }] } });
    await tx.dealParticipant.createMany({ data: buyers.map((employeeId) => ({ dealId, employeeId, side: "BUYER" as const })) });
  }

  /** Active salespeople (and TLs); only these ids when given. */
  salespeople(ids?: string[]) {
    return this.db.employee.findMany({
      where: { ...(ids ? { id: { in: ids } } : {}), user: { status: { not: "DISABLED" }, roles: { some: { role: { key: { in: [...DEAL_MAKERS] } } } } } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
  }

  /** Q26 (4.9): the deals on the sheet with only what marketing may see. */
  forMarketing(f: Page, onSheet: string[]) {
    const where: Prisma.DealWhereInput = { status: { in: onSheet as never } };
    return this.db.$transaction([
      this.db.deal.findMany({ where, select: MARKETING_ROW, orderBy: [{ reviewedAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.deal.count({ where }),
    ]);
  }

  onSheet(id: string, onSheet: string[], tx: Prisma.TransactionClient = this.db) {
    return tx.deal.findFirst({ where: { id, status: { in: onSheet as never } }, select: { id: true, code: true } });
  }

  /** The newest logo of each deal (files attached as «DealLogo»; an older one stays in storage, the newest shows). */
  async logos(dealIds: string[], tx: Prisma.TransactionClient = this.db) {
    const files = await tx.file.findMany({ where: { entity: LOGO, entityId: { in: dealIds }, status: "READY" }, select: { id: true, name: true, entityId: true }, orderBy: { createdAt: "asc" } });
    return new Map(files.map((f) => [f.entityId!, { id: f.id, name: f.name }]));
  }

  /** M-11: on-sheet deals in scope with no contract yet. */
  contractable(scope: Prisma.DealWhereInput, onSheet: string[]) {
    return this.db.deal.findMany({
      where: { AND: [scope, { status: { in: onSheet as never }, contract: null }] },
      select: { id: true, code: true, company: true, unit: { select: { code: true } } }, orderBy: { closedAt: "desc" }, take: 200,
    });
  }

  /** A salesperson's account and their TL's (who the lead rules' «owner» / «ownerTl» are). */
  account(employeeId: string) {
    return this.db.employee.findUnique({ where: { id: employeeId }, select: { userId: true, teamLeader: { select: { userId: true } } } });
  }

  async userName(userId: string) {
    return (await this.db.employee.findUnique({ where: { userId }, select: { name: true } }))?.name ?? null;
  }

  /** 5.3: one collection at a time per deal, so two at once can't both pass «not above what's left». */
  lock(tx: Prisma.TransactionClient, id: string) {
    return tx.$executeRaw`SELECT 1 FROM sales."Deal" WHERE id = ${id} FOR UPDATE`;
  }

  /** 9.12: the client file the deal's lead joined at Done Deal (M-10 2.1). */
  async clientOf(tx: Prisma.TransactionClient, id: string) {
    return (await tx.deal.findUnique({ where: { id }, select: { lead: { select: { clientId: true } } } }))?.lead?.clientId ?? null;
  }

  payments(tx: Prisma.TransactionClient, dealId: string) {
    return tx.payment.findMany({ where: { dealId }, select: { side: true, amount: true, receivedAt: true } });
  }

  /** 5.4: Manar's approval puts the waiting Seller on the deal. */
  approveSellers(tx: Prisma.TransactionClient, dealId: string) {
    return tx.dealParticipant.updateMany({ where: { dealId, side: "SELLER", approved: false }, data: { approved: true } });
  }

  /** 9.10: the collected deals (revenue booked, not cancelled) with their lead's area and campaign, by the report's filters. */
  costCenter(f: CostCenterFilters) {
    // the report's days are Cairo days (a deal closed at 1 a.m. belongs to that day, not the UTC one before)
    const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    return this.db.deal.findMany({
      where: {
        status: { in: ["PARTIALLY_COLLECTED", "FULLY_COLLECTED"] },
        ...(f.channel ? { source: f.channel } : {}),
        ...(f.salesId ? { participants: { some: { employeeId: f.salesId } } } : {}),
        ...(f.from || f.to ? { closedAt: { ...(f.from ? { gte: dayStart(f.from) } : {}), ...(f.to ? { lt: dayStart(nextDay(f.to)) } : {}) } } : {}),
        ...(f.area || f.campaignId ? { lead: { ...(f.area ? { area: f.area } : {}), ...(f.campaignId ? { campaignId: f.campaignId } : {}) } } : {}),
      },
      select: {
        ...DEAL_ROW, source: true, externalCommission: true,
        payments: { select: { side: true, amount: true } },
        lead: { select: { area: true, campaign: { select: { id: true, name: true, spent: true } } } },
      },
      orderBy: { closedAt: "desc" },
    });
  }

  /** Q40: each campaign's Qualified leads. */
  async qualifiedLeads(campaignIds: string[]) {
    const rows = await this.db.lead.groupBy({ by: ["campaignId"], where: { qualified: true, campaignId: { in: campaignIds } }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.campaignId!, r._count._all]));
  }

  campaigns() {
    return this.db.campaign.findMany({ select: { id: true, name: true }, orderBy: { startsOn: "desc" } });
  }

  /** 5.8: the TLs of these salespeople. */
  async teamLeaders(ids: string[], tx: Prisma.TransactionClient) {
    const rows = await tx.employee.findMany({ where: { id: { in: ids }, teamLeaderId: { not: null } }, select: { teamLeaderId: true } });
    return [...new Set(rows.map((r) => r.teamLeaderId!))];
  }

  /** 5.8: one TL month worked out at a time, so two collections at once can't both book the same difference. */
  lockKey(tx: Prisma.TransactionClient, key: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  addPayment(tx: Prisma.TransactionClient, data: Prisma.PaymentUncheckedCreateInput) {
    return tx.payment.create({ data, select: { id: true } });
  }

  nextTcr(tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('sales.tcr_code_seq') AS n`; // created by the 5.12 migration
  }

  /** 5.12: the collection's TCR, with an unsigned line for each salesperson on the deal. */
  addTcr(tx: Prisma.TransactionClient, data: { code: number; dealId: string; paymentId: string; signers: string[] }) {
    const { signers, ...tcr } = data;
    return tx.tcr.create({ data: { ...tcr, signatures: { create: signers.map((employeeId) => ({ employeeId })) } }, select: { id: true } });
  }

  /** A TCR of a deal in the caller's scope. */
  tcr(scope: Prisma.DealWhereInput, dealId: string, id: string, tx: Prisma.TransactionClient = this.db) {
    return tx.tcr.findFirst({ where: { id, deal: { AND: [scope, { id: dealId }] } }, select: TCR });
  }

  /** Only an unsigned line: two clicks at once sign once. */
  sign(tx: Prisma.TransactionClient, tcrId: string, employeeId: string, signedAt: Date) {
    return tx.tcrSignature.updateMany({ where: { tcrId, employeeId, signedAt: null }, data: { signedAt } });
  }

  /** Each salesperson's scheme % (M-02: their commission is that % of their share). */
  schemes(ids: string[], tx: Prisma.TransactionClient = this.db) {
    return tx.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, commissionPct: true } });
  }

  /** 9.15: the approved deals a salesperson is on, with every collection (his «كشف عمولة»). */
  commissionDeals(employeeId: string, tx: Prisma.TransactionClient = this.db) {
    return tx.deal.findMany({
      where: { participants: { some: { employeeId } }, status: { in: ["APPROVED", "PARTIALLY_COLLECTED", "FULLY_COLLECTED"] } },
      select: { ...DEAL_DETAIL, payments: { select: { side: true, amount: true, receivedAt: true } } }, orderBy: { closedAt: "desc" },
    });
  }

  payouts(employeeId: string, tx: Prisma.TransactionClient = this.db) {
    return tx.commissionPayout.findMany({ where: { employeeId }, select: { id: true, dealId: true, amount: true, moveId: true, deal: { select: { code: true } }, tcr: { select: { code: true } } }, orderBy: { createdAt: "asc" } });
  }

  addPayout(tx: Prisma.TransactionClient, data: Prisma.CommissionPayoutUncheckedCreateInput) {
    return tx.commissionPayout.create({ data, select: { id: true } });
  }

  /** 9.15: every salesperson / TL with their own 21103 account (opened the first time commission was due). */
  commissionAccounts() {
    return this.db.account.findMany({ where: { partyType: "sales" }, select: { id: true, code: true, name: true, partyId: true }, orderBy: { code: "asc" } });
  }

  employeeNames(ids: string[]) {
    return this.db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, userId: true } });
  }
}

/**
 * Search the sheet by company, deal code, unit code or a salesperson's name (M-02 5.2). `byLocation` false: the
 * location is hidden from the caller (M-09), so it isn't searched (a match would tell it).
 */
export function search(q: string | undefined, byLocation = true): Prisma.DealWhereInput {
  if (!q) return {};
  const has = { contains: q, mode: "insensitive" } as const;
  return { OR: [{ company: has }, { code: has }, ...(byLocation ? [{ location: has }] : []), { unit: { code: has } }, { participants: { some: { employee: { name: has } } } }] };
}
