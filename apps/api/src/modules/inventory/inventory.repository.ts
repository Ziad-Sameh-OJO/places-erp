import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { UnitFilters } from "@places/contracts";
import { sortAreaTabs, type AreaRange, type UnitType } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

/** What the list reads of a unit (no audit trail, no media keys). */
export const UNIT_ROW = {
  id: true, code: true, type: true, alsoType: true, status: true, alsoStatus: true, project: true, area: true, space: true,
  condition: true, floor: true, building: true, parking: true, ownerName: true, ownerPhone: true, pricePerSqm: true,
  totalPrice: true, leasePerSqm: true, maintenance: true, commission: true, paymentMethod: true, details: true,
  divisible: true, minSplit: true, location: true, areaTabId: true, agentId: true, lastOwnerUpdateAt: true, pdfStatus: true, createdAt: true,
} satisfies Prisma.UnitSelect;
export const UNIT_DETAIL = { ...UNIT_ROW, splitNote: true, receivedAt: true, enteredAt: true, createdById: true, updatedAt: true } satisfies Prisma.UnitSelect;
export type UnitRowRecord = Prisma.UnitGetPayload<{ select: typeof UNIT_ROW }>;
export type UnitRecord = Prisma.UnitGetPayload<{ select: typeof UNIT_DETAIL }>;

/** Who the list is for: drafts and owners' details are for the people who keep the inventory (domain keepsInventory). */
export interface UnitScope { insider: boolean; staleBefore: Date }
export type Tab = AreaRange & { id: string };

/** Data access only. The visibility rule (Q15: no drafts for sales) is part of every query, never filtered afterwards. */
@Injectable()
export class InventoryRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /**
   * The Visit form's unit list (1.9): open units a salesperson may see, searched by code, project or space. The units
   * already picked stay on the form itself, so a search never drops them.
   */
  forVisit(q: string | undefined, take: number) {
    return this.db.unit.findMany({ where: openSearch(q), select: { id: true, code: true, project: true, space: true }, orderBy: { code: "asc" }, take });
  }

  /** «سجّل صفقة» (M-02): the same open, confirmed units, with what the deal takes from them (type, agent = Seller). */
  forDeal(q: string | undefined, take: number) {
    return this.db.unit.findMany({ where: openSearch(q), select: DEAL_UNIT, orderBy: { code: "asc" }, take });
  }

  openForDeal(id: string) {
    return this.db.unit.findFirst({ where: { AND: [{ id }, openSearch(undefined)] }, select: DEAL_UNIT });
  }

  /**
   * The units that can be suggested to a client (2.12): open as their type, confirmed for sales (Q15), with their
   * finishing, and either in the space window or divisible and bigger. The domain rule does the rest.
   */
  forRecommendation(type: UnitType, condition: string | null, window: { min: number; max: number; need: number } | null, take: number) {
    const space: Prisma.UnitWhereInput = window
      ? { OR: [{ space: { gte: window.min, lte: window.max } }, { divisible: true, space: { gt: window.need } }] } : {};
    return this.db.unit.findMany({
      where: { AND: [
        visible({ insider: false, staleBefore: new Date(0) }),
        { OR: [{ type, status: "available" }, { alsoType: type, alsoStatus: "available" }] },
        condition ? { condition } : {}, space,
      ] },
      select: {
        id: true, code: true, type: true, alsoType: true, status: true, alsoStatus: true, project: true, area: true, space: true, condition: true,
        floor: true, parking: true, pricePerSqm: true, divisible: true, minSplit: true, paymentMethod: true, details: true,
      },
      orderBy: { code: "asc" }, take,
    });
  }

  /** Of these ids, the open units a salesperson may see, with what the client's list shows (2.13). */
  forClientList(ids: string[]) {
    return this.db.unit.findMany({
      where: { AND: [{ id: { in: ids } }, visible({ insider: false, staleBefore: new Date(0) }), AVAILABLE] },
      select: { id: true, code: true, type: true, project: true, area: true, floor: true, space: true, condition: true, parking: true, totalPrice: true },
    });
  }

  codes(ids: string[]) {
    return this.db.unit.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } });
  }

  /** Of these ids, the open units a salesperson may see (a Visit can't name a draft, archived or closed unit). */
  openForVisit(ids: string[]) {
    return this.db.unit.findMany({ where: { AND: [{ id: { in: ids } }, visible({ insider: false, staleBefore: new Date(0) }), AVAILABLE] }, select: { id: true } });
  }

  list(s: UnitScope, f: UnitFilters, tabs: Tab[]) {
    const where = unitWhere(s, f, tabs);
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
  tabCounts(s: UnitScope, f: UnitFilters, types: readonly UnitType[], tabs: Tab[]) {
    const count = (w: Prisma.UnitWhereInput) => this.db.unit.count({ where: w });
    const rest = { ...f, type: undefined };
    return this.db.$transaction([
      count(unitWhere(s, { ...rest, view: "available" }, tabs)),
      ...types.map((type) => count(unitWhere(s, { ...rest, view: "available", type }, tabs))),
      count(unitWhere(s, { ...rest, view: "closed" }, tabs)),
    ]);
  }

  /** The area tabs' counts: available units in each, under the list's other filters (the area tab set aside). */
  areaTabCounts(s: UnitScope, f: UnitFilters, tabs: Tab[]) {
    return this.db.$transaction(tabs.map((t) => this.db.unit.count({ where: unitWhere(s, { ...f, view: "available", tabId: t.id }, tabs) })));
  }

  areaTabs(tx: Prisma.TransactionClient = this.db) {
    return tx.areaTab.findMany({ select: { id: true, min: true, max: true } }).then(sortAreaTabs);
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

}

const AVAILABLE: Prisma.UnitWhereInput = { OR: [{ status: "available" }, { alsoType: { not: null }, alsoStatus: "available" }] };
const CLOSED: Prisma.UnitWhereInput = { OR: [{ status: { not: "available" } }, { alsoStatus: { in: ["rented", "sold"] } }] };

/** Archived units are gone for everyone; drafts only for the people who keep the inventory (Q15). */
const visible = (s: UnitScope): Prisma.UnitWhereInput => ({ archivedAt: null, ...(s.insider ? {} : { pdfStatus: "confirmed" }) });

/** Open units a salesperson may see, searched by code, project or space (a Visit or a deal can't name any other). */
function openSearch(q: string | undefined): Prisma.UnitWhereInput {
  const space = q && /^\d+$/.test(q) ? [{ space: Number(q) }] : [];
  const search: Prisma.UnitWhereInput = q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { project: { contains: q, mode: "insensitive" } }, ...space] } : {};
  return { AND: [visible({ insider: false, staleBefore: new Date(0) }), AVAILABLE, search] };
}
const DEAL_UNIT = { id: true, code: true, project: true, space: true, type: true, agentId: true } satisfies Prisma.UnitSelect;

const range = (t: AreaRange): Prisma.UnitWhereInput => ({ space: { gte: t.min, ...(t.max != null ? { lte: t.max } : {}) } });

/**
 * A unit is under an area tab when Manar put it there, or — not put anywhere — when its area is in the tab's range
 * and in no tab shown before it (domain unitAreaTab: the first range wins). An unknown tab matches nothing.
 */
function inTab(tabId: string, tabs: Tab[]): Prisma.UnitWhereInput {
  const at = tabs.findIndex((t) => t.id === tabId);
  if (at < 0) return { id: { in: [] } };
  // a removed tab's units are set back to null by the foreign key, so null = «by its area»
  return { OR: [{ areaTabId: tabId }, { AND: [{ areaTabId: null }, range(tabs[at]!), ...tabs.slice(0, at).map((e) => ({ NOT: range(e) }))] }] };
}

function unitWhere(s: UnitScope, f: Omit<UnitFilters, "page" | "pageSize">, tabs: Tab[]): Prisma.UnitWhereInput {
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
  if (f.tabId) and.push(inTab(f.tabId, tabs));
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
