import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { DealFilters } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";

const PERSON = { select: { id: true, name: true } } as const;
export const DEAL_ROW = {
  id: true, code: true, company: true, location: true, space: true, type: true, status: true, commissionOwner: true, commissionClient: true,
  closedAt: true, offTarget: true, note: true, targetBase: true,
  unit: { select: { id: true, code: true } },
  participants: { select: { side: true, approved: true, employee: PERSON }, orderBy: { employee: { name: "asc" } } },
} satisfies Prisma.DealSelect;
const DEAL_DETAIL = {
  ...DEAL_ROW, leadId: true, source: true, reviewNote: true, reviewedById: true, reviewedAt: true, createdAt: true, createdById: true,
  lead: { select: { code: true } },
} satisfies Prisma.DealSelect;
export type DealRowRecord = Prisma.DealGetPayload<{ select: typeof DEAL_ROW }>;
export type DealRecord = Prisma.DealGetPayload<{ select: typeof DEAL_DETAIL }>;

/** The roles that close deals and can stand on the Buyer side («حد معاك في الديل Buyer؟»). */
const DEAL_MAKERS = ["sales", "tl"] as const;

/** Prisma only (M-02). The data scope comes in as a `where` built by the service. */
@Injectable()
export class DealsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list(scope: Prisma.DealWhereInput, f: DealFilters, status: string | undefined) {
    const where: Prisma.DealWhereInput = { AND: [scope, status ? { status: status as never } : {}, search(f.q)] };
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

  /** A salesperson's account and their TL's (who the lead rules' «owner» / «ownerTl» are). */
  account(employeeId: string) {
    return this.db.employee.findUnique({ where: { id: employeeId }, select: { userId: true, teamLeader: { select: { userId: true } } } });
  }

  async userName(userId: string) {
    return (await this.db.employee.findUnique({ where: { userId }, select: { name: true } }))?.name ?? null;
  }

  employeeNames(ids: string[]) {
    return this.db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, userId: true } });
  }
}

/** Search the sheet by company, deal code, unit code or a salesperson's name (M-02 5.2). */
function search(q: string | undefined): Prisma.DealWhereInput {
  if (!q) return {};
  const has = { contains: q, mode: "insensitive" } as const;
  return { OR: [{ company: has }, { code: has }, { location: has }, { unit: { code: has } }, { participants: { some: { employee: { name: has } } } }] };
}
