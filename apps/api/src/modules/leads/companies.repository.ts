import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CompanyFilters } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";

type Tx = Prisma.TransactionClient | PrismaClient;

/** «شيت الشركات» (1.20): Prisma only. */
@Injectable()
export class CompaniesRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  page(f: CompanyFilters) {
    const where: Prisma.CompanyWhereInput = {
      ...(f.category ? { category: f.category } : {}),
      ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { number: { contains: f.q } }] } : {}),
    };
    return this.db.$transaction([
      this.db.company.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.company.count({ where }),
    ]);
  }

  categoryCounts() {
    return this.db.company.groupBy({ by: ["category"], _count: { _all: true } });
  }

  outboundSince(userId: string, since: Date) {
    return this.db.company.count({ where: { outbound: true, createdById: userId, createdAt: { gte: since } } });
  }

  /** Names for the new-lead form's «اكتب أو اختار من شيت الشركات». */
  names(q: string) {
    return this.db.company.findMany({ where: { name: { contains: q, mode: "insensitive" } }, select: { name: true }, orderBy: { name: "asc" }, take: 10 });
  }

  /** The same company by name (any case) or by number. */
  findSame(name: string, number: string | null, tx: Tx = this.db) {
    return tx.company.findFirst({ where: { OR: [{ name: { equals: name.trim(), mode: "insensitive" } }, ...(number ? [{ number }] : [])] }, select: { id: true, name: true } });
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
