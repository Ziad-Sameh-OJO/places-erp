import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CompanyFilters } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";

type Tx = Prisma.TransactionClient | PrismaClient;

/** «شيت الشركات» (1.20): Prisma only. */
@Injectable()
export class CompaniesRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /** `ids`: the companies whose name matches «بحث» however it was spelled (the service's, @places/domain nameContains). */
  page(f: CompanyFilters, ending: Window | undefined, ids: string[] | undefined) {
    const where = companyWhere(f, ending, ids);
    return this.db.$transaction([
      this.db.company.findMany({ where, orderBy: ending ? [{ contractEnd: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.company.count({ where }),
    ]);
  }

  /** The report's rows for Excel (1.21): the same filters, every row up to the export limit. */
  all(f: CompanyFilters, ending: Window | undefined, ids: string[] | undefined, limit: number) {
    return this.db.company.findMany({ where: companyWhere(f, ending, ids), orderBy: ending ? [{ contractEnd: "asc" }, { id: "asc" }] : [{ name: "asc" }], take: limit });
  }

  /** Every name in the sheet, in lower case: the archive import skips the ones already there. */
  async allNames(tx: Tx) {
    return new Set((await tx.company.findMany({ select: { name: true } })).map((c) => c.name.trim().toLowerCase()));
  }

  categoryCounts() {
    return this.db.company.groupBy({ by: ["category"], _count: { _all: true } });
  }

  outboundSince(userId: string, since: Date) {
    return this.db.company.count({ where: { outbound: true, createdById: userId, createdAt: { gte: since } } });
  }

  /** Every company's id and name: names are compared in the service, spelled either way (@places/domain company-names). */
  nameList(tx: Tx = this.db) {
    return tx.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  /** Another company with this number. */
  byNumber(number: string, tx: Tx = this.db, exceptId?: string) {
    return tx.company.findFirst({ where: { number, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true, name: true } });
  }

  pendingRequestNames(tx: Tx) {
    return tx.companyRequest.findMany({ where: { status: "pending" }, select: { id: true, name: true } });
  }

  /** A lead that has this number as one of its mobiles («رقم الشركة بيتقارن بأرقام الليدز»). */
  leadWithPhone(number: string) {
    return this.db.lead.findFirst({ where: { phones: { has: number }, archivedAt: null }, select: { code: true } });
  }

  pending() {
    return this.db.companyRequest.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 200,
      select: { id: true, name: true, createdAt: true, byUserId: true, lead: { select: { id: true, code: true } } } });
  }

  userNames(ids: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: [...new Set(ids)] } }, select: { userId: true, name: true } });
  }
}

type Window = { from: string; to: string };
const asDay = (d: string) => new Date(`${d}T00:00:00Z`);

function companyWhere(f: CompanyFilters, ending: Window | undefined, ids: string[] | undefined): Prisma.CompanyWhereInput {
  return {
    ...(f.category ? { category: f.category } : {}),
    ...(f.q ? { OR: [{ id: { in: ids ?? [] } }, { number: { contains: f.q } }] } : {}),
    ...(ending ? { contractEnd: { gte: asDay(ending.from), lte: asDay(ending.to) } } : {}),
  };
}
