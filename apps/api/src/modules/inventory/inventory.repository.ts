import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { UnitFilters } from "@places/contracts";
import type { UnitType } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

/** What the list reads of a unit (no audit trail, no media keys). */
export const UNIT_ROW = {
  id: true, code: true, type: true, alsoType: true, status: true, alsoStatus: true, project: true, area: true, space: true,
  condition: true, floor: true, building: true, parking: true, ownerName: true, ownerPhone: true, pricePerSqm: true,
  totalPrice: true, leasePerSqm: true, maintenance: true, commission: true, paymentMethod: true, details: true,
  divisible: true, minSplit: true, location: true, agentId: true, lastOwnerUpdateAt: true, pdfStatus: true, createdAt: true,
} satisfies Prisma.UnitSelect;
export const UNIT_DETAIL = { ...UNIT_ROW, splitNote: true, receivedAt: true, enteredAt: true, createdById: true, updatedAt: true } satisfies Prisma.UnitSelect;
export type UnitRowRecord = Prisma.UnitGetPayload<{ select: typeof UNIT_ROW }>;
export type UnitRecord = Prisma.UnitGetPayload<{ select: typeof UNIT_DETAIL }>;

/** Who the list is for: drafts and owners' details are for the people who keep the inventory (domain keepsInventory). */
export interface UnitScope { insider: boolean; staleBefore: Date }

/** Data access only. The visibility rule (Q15: no drafts for sales) is part of every query, never filtered afterwards. */
@Injectable()
export class InventoryRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list(s: UnitScope, f: UnitFilters) {
    const where = unitWhere(s, f);
    return this.db.$transaction([
      this.db.unit.findMany({ where, select: UNIT_ROW, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.db.unit.count({ where }),
    ]);
  }

  /** The KPI tiles: available, waiting for the PDF confirm, late update, divisible. */
  summary(s: UnitScope) {
    const base = visible(s);
    const count = (w: Prisma.UnitWhereInput) => this.db.unit.count({ where: { AND: [base, AVAILABLE, w] } });
    return this.db.$transaction([
      count({}), count({ pdfStatus: "draft" }), count({ lastOwnerUpdateAt: { lt: s.staleBefore } }), count({ divisible: true }),
    ]);
  }

  /** The type tabs' counts under the current filters (the tab itself set aside). */
  tabCounts(s: UnitScope, f: UnitFilters, types: readonly UnitType[]) {
    const count = (w: Prisma.UnitWhereInput) => this.db.unit.count({ where: w });
    const rest = { ...f, type: undefined };
    return this.db.$transaction([
      count(unitWhere(s, { ...rest, view: "available" })),
      ...types.map((type) => count(unitWhere(s, { ...rest, view: "available", type }))),
      count(unitWhere(s, { ...rest, view: "closed" })),
    ]);
  }

  detail(s: UnitScope, id: string, tx: Prisma.TransactionClient = this.db) {
    return tx.unit.findFirst({ where: { AND: [visible(s), { id }] }, select: UNIT_DETAIL });
  }

  nextCode(tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('inventory.unit_code_seq') AS n`; // created by the 2.1 migration
  }

  /** Active people who can be a unit's agent: «اسامي كل السيلز و كذا حد تاني» (M-03 3.1), so anyone still working here. */
  agents(ids?: string[]) {
    return this.db.employee.findMany({
      where: { user: { status: { not: "DISABLED" } }, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
  }

  employeeNames(ids: string[]) {
    return this.db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }

  userName(userId: string) {
    return this.db.employee.findUnique({ where: { userId }, select: { name: true } });
  }

  /** The payment methods already written, offered as suggestions in the form. */
  paymentMethods() {
    return this.db.unit.findMany({ where: { paymentMethod: { not: null }, archivedAt: null }, select: { paymentMethod: true }, distinct: ["paymentMethod"], take: 50 });
  }
}

const AVAILABLE: Prisma.UnitWhereInput = { OR: [{ status: "available" }, { alsoType: { not: null }, alsoStatus: "available" }] };
const CLOSED: Prisma.UnitWhereInput = { OR: [{ status: { not: "available" } }, { alsoStatus: { in: ["rented", "sold"] } }] };

/** Archived units are gone for everyone; drafts only for the people who keep the inventory (Q15). */
const visible = (s: UnitScope): Prisma.UnitWhereInput => ({ archivedAt: null, ...(s.insider ? {} : { pdfStatus: "confirmed" }) });

function unitWhere(s: UnitScope, f: Omit<UnitFilters, "page" | "pageSize">): Prisma.UnitWhereInput {
  const and: Prisma.UnitWhereInput[] = [visible(s), f.view === "closed" ? CLOSED : AVAILABLE];
  // a unit is listed under a type when it's open as that type, or as its second type (Q17)
  if (f.type) and.push(f.view === "closed"
    ? { OR: [{ type: f.type }, { alsoType: f.type }] }
    : { OR: [{ type: f.type, status: "available" }, { alsoType: f.type, alsoStatus: "available" }] });
  if (f.area) and.push({ area: f.area });
  if (f.condition) and.push({ condition: f.condition });
  if (f.agentId) and.push({ agentId: f.agentId });
  if (f.minSpace != null || f.maxSpace != null) and.push({ space: { ...(f.minSpace != null ? { gte: f.minSpace } : {}), ...(f.maxSpace != null ? { lte: f.maxSpace } : {}) } });
  if (f.minPrice != null || f.maxPrice != null) and.push({ totalPrice: { ...(f.minPrice != null ? { gte: f.minPrice } : {}), ...(f.maxPrice != null ? { lte: f.maxPrice } : {}) } });
  if (f.stale === true) and.push({ lastOwnerUpdateAt: { lt: s.staleBefore } });
  if (f.stale === false) and.push({ lastOwnerUpdateAt: { gte: s.staleBefore } });
  if (f.divisible != null) and.push({ divisible: f.divisible });
  if (f.q) {
    const q = { contains: f.q, mode: "insensitive" as const };
    const digits = f.q.replace(/\D/g, "");
    and.push({ OR: [
      { code: q }, { project: q }, { area: q }, { building: q },
      // owners are searched only by the people who see them
      ...(s.insider ? [{ ownerName: q }, ...(digits.length >= 4 ? [{ ownerPhone: { contains: digits } }] : [])] : []),
    ] });
  }
  return { AND: and };
}
