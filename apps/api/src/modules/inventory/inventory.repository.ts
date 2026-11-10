import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { UnitFilters } from "@places/contracts";
import { dayStart, sortAreaTabs, type AreaRange, type UnitType } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";

/** What the list reads of a unit (no audit trail, no media keys). */
export const UNIT_ROW = {
  id: true, code: true, type: true, alsoType: true, status: true, alsoStatus: true, project: true, area: true, space: true,
  condition: true, floor: true, building: true, parking: true, ownerName: true, ownerPhone: true, pricePerSqm: true,
  totalPrice: true, leasePerSqm: true, maintenance: true, commission: true, paymentMethod: true, layout: true, comment: true, details: true,
  divisible: true, minSplit: true, location: true, agreementFileId: true, areaTabId: true, agentId: true, lastOwnerUpdateAt: true, pdfStatus: true, createdAt: true,
  // the confirmed Done Deals: the rented / sold sheet's date and deal (2.10)
  locks: { where: { status: "locked" }, select: { type: true, lockedAt: true, deal: { select: { code: true } } }, orderBy: { lockedAt: "asc" } },
  // the main photo (2.4: the first image, never a PDF of the folder, 2.22) and how many files there are
  photos: { where: { pdf: false }, select: { fileId: true }, orderBy: { position: "asc" }, take: 1 },
  _count: { select: { photos: true } },
} satisfies Prisma.UnitSelect;
export const UNIT_DETAIL = { ...UNIT_ROW, ownerId: true, splitNote: true, receivedAt: true, enteredAt: true, createdById: true, updatedAt: true, mediaUploadedAt: true } satisfies Prisma.UnitSelect;
export type UnitRowRecord = Prisma.UnitGetPayload<{ select: typeof UNIT_ROW }>;
export type UnitRecord = Prisma.UnitGetPayload<{ select: typeof UNIT_DETAIL }>;

/** Who the list is for: drafts and owners' details are for the people who keep the inventory (domain keepsInventory). */
/** `owners`: the owner name / number the person may search by (the inventory team, and only the fields not hidden from them, 2.36). */
export interface UnitScope { insider: boolean; staleBefore: Date; owners?: { name: boolean; phone: boolean } }
export type Tab = AreaRange & { id: string };
/** The list's filters, with «ناقصها بيانات» (2.20) resolved to the units it names (the service works them out). */
export type ListFilters = UnitFilters & { missingIds?: string[] };
/** What the missing-data check (domain missingFields) reads of a unit. */
const MISSING_CHECK = {
  id: true, code: true, type: true, project: true, space: true, condition: true, building: true, ownerName: true, ownerPhone: true,
  pricePerSqm: true, leasePerSqm: true, maintenance: true, commission: true, paymentMethod: true, location: true, details: true,
  _count: { select: { photos: { where: { pdf: false } } } }, // a PDF alone isn't the unit's photos
} satisfies Prisma.UnitSelect;

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

  /** Marketing's board of new units (M-04 4.4): open, not archived, not Done by marketing yet. */
  forMarketing() {
    return this.db.unit.findMany({
      where: { AND: [{ archivedAt: null, marketingDoneAt: null }, AVAILABLE] },
      select: { id: true, code: true, project: true, area: true, space: true, type: true, pdfStatus: true, createdAt: true },
      orderBy: { createdAt: "desc" }, take: 200,
    });
  }

  unitById(id: string) {
    return this.db.unit.findUnique({ where: { id }, select: { id: true, code: true, archivedAt: true, marketingDoneAt: true } });
  }

  /** A task's unit (M-04 4.2): open units, drafts too — a new unit's shoot is given before Manar confirms its PDF (M-03 2.1 steps 4-5). */
  forTasks(q: string | undefined, take: number) {
    return this.db.unit.findMany({ where: openSearch(q, true), select: { id: true, code: true, project: true, space: true }, orderBy: { code: "asc" }, take });
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

  /** A TL's List (2.32): of these ids, the open units a salesperson may see, with their last owner update («مش مؤكدة»). */
  forList(ids: string[]) {
    return this.db.unit.findMany({
      where: { AND: [{ id: { in: ids } }, visible({ insider: false, staleBefore: new Date(0) }), AVAILABLE] },
      select: { id: true, code: true, lastOwnerUpdateAt: true },
    });
  }

  /** Every unit's owner number (Not Active rows are compared with them, M-03 1.1), archived ones aside. */
  ownerPhones() {
    return this.db.unit.findMany({ where: { archivedAt: null, ownerPhone: { not: null } }, select: { id: true, code: true, ownerPhone: true } });
  }

  codes(ids: string[]) {
    return this.db.unit.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } });
  }

  /** Of these ids, the open units a salesperson may see (a Visit can't name a draft, archived or closed unit). */
  openForVisit(ids: string[]) {
    return this.db.unit.findMany({ where: { AND: [{ id: { in: ids } }, visible({ insider: false, staleBefore: new Date(0) }), AVAILABLE] }, select: { id: true } });
  }

  /** Every unit the person can see that isn't archived, for the missing-data check (2.20), newest first. */
  forMissingCheck(s: UnitScope) {
    return this.db.unit.findMany({ where: visible(s), select: MISSING_CHECK, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  }

  list(s: UnitScope, f: ListFilters, tabs: Tab[]) {
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
  tabCounts(s: UnitScope, f: ListFilters, types: readonly UnitType[], tabs: Tab[]) {
    const count = (w: Prisma.UnitWhereInput) => this.db.unit.count({ where: w });
    const rest = { ...f, type: undefined };
    return this.db.$transaction([
      count(unitWhere(s, { ...rest, view: "available" }, tabs)),
      ...types.map((type) => count(unitWhere(s, { ...rest, view: "available", type }, tabs))),
      count(unitWhere(s, { ...rest, view: "closed" }, tabs)),
    ]);
  }

  /** The area tabs' counts: available units in each, under the list's other filters (the area tab set aside). */
  areaTabCounts(s: UnitScope, f: ListFilters, tabs: Tab[]) {
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

  /** Employee names by their user id (who uploaded a unit's photos, 2.22). */
  namesByUser(userIds: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } });
  }

  userName(userId: string) {
    return this.db.employee.findUnique({ where: { userId }, select: { name: true } });
  }

  /** A unit's photos in their order (2.4). */
  photos(unitId: string, tx: Prisma.TransactionClient = this.db) {
    return tx.unitPhoto.findMany({ where: { unitId }, orderBy: { position: "asc" }, select: { id: true, fileId: true, pdf: true } });
  }

  /** A unit's two sides, for closing one (Q16 · Q17). Archived units can't be closed. */
  sides(unitId: string, tx: Prisma.TransactionClient = this.db) {
    return tx.unit.findFirst({ where: { id: unitId, archivedAt: null }, select: { id: true, code: true, project: true, type: true, status: true, alsoType: true, alsoStatus: true } });
  }

  lockOf(unitId: string, dealId: string, tx: Prisma.TransactionClient = this.db) {
    return tx.unitLock.findUnique({ where: { unitId_dealId: { unitId, dealId } } });
  }

  /** The Done Deals on a unit, with their codes (the drawer). */
  locks(unitId: string) {
    return this.db.unitLock.findMany({ where: { unitId }, include: { deal: { select: { code: true } } }, orderBy: { requestedAt: "asc" } });
  }
}

const AVAILABLE: Prisma.UnitWhereInput = { OR: [{ status: "available" }, { alsoType: { not: null }, alsoStatus: "available" }] };
const CLOSED: Prisma.UnitWhereInput = { OR: [{ status: { not: "available" } }, { alsoStatus: { in: ["rented", "sold"] } }] };

/** Archived units are gone for everyone; drafts only for the people who keep the inventory (Q15). */
const visible = (s: UnitScope): Prisma.UnitWhereInput => ({ archivedAt: null, ...(s.insider ? {} : { pdfStatus: "confirmed" }) });

/** Open units a salesperson may see, searched by code, project or space (a Visit or a deal can't name any other). */
function openSearch(q: string | undefined, insider = false): Prisma.UnitWhereInput {
  const space = q && /^\d+$/.test(q) ? [{ space: Number(q) }] : [];
  const search: Prisma.UnitWhereInput = q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { project: { contains: q, mode: "insensitive" } }, ...space] } : {};
  return { AND: [visible({ insider, staleBefore: new Date(0) }), AVAILABLE, search] };
}
const DEAL_UNIT = { id: true, code: true, project: true, space: true, type: true, agentId: true } satisfies Prisma.UnitSelect;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

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

function unitWhere(s: UnitScope, f: Omit<ListFilters, "page" | "pageSize">, tabs: Tab[]): Prisma.UnitWhereInput {
  const and: Prisma.UnitWhereInput[] = [visible(s), f.view === "closed" ? CLOSED : AVAILABLE];
  // a unit is listed under a type when it's open as that type, or as its second type (Q17); on the rented / sold
  // sheet, when that type is the side that was closed
  if (f.type) and.push(f.view === "closed"
    ? { OR: [{ type: f.type, status: { not: "available" } }, { alsoType: f.type, alsoStatus: { in: ["rented", "sold"] } }] }
    : { OR: [{ type: f.type, status: "available" }, { alsoType: f.type, alsoStatus: "available" }] });
  // M-03 5.2: closed between two Cairo days (the day Manar / Randa confirmed the close), on the chosen type's side
  if (f.view === "closed" && (f.closedFrom || f.closedTo)) and.push({ locks: { some: {
    status: "locked", ...(f.type ? { type: f.type } : {}),
    lockedAt: { ...(f.closedFrom ? { gte: dayStart(f.closedFrom) } : {}), ...(f.closedTo ? { lt: dayStart(nextDay(f.closedTo)) } : {}) },
  } } });
  if (f.area) and.push({ area: f.area });
  if (f.condition) and.push({ condition: f.condition });
  if (f.agentId) and.push({ agentId: f.agentId });
  if (f.minSpace != null || f.maxSpace != null) and.push({ space: { ...(f.minSpace != null ? { gte: f.minSpace } : {}), ...(f.maxSpace != null ? { lte: f.maxSpace } : {}) } });
  if (f.minPrice != null || f.maxPrice != null) and.push({ totalPrice: { ...(f.minPrice != null ? { gte: f.minPrice } : {}), ...(f.maxPrice != null ? { lte: f.maxPrice } : {}) } });
  if (f.stale === true) and.push({ lastOwnerUpdateAt: { lt: s.staleBefore } });
  if (f.stale === false) and.push({ lastOwnerUpdateAt: { gte: s.staleBefore } });
  if (f.divisible != null) and.push({ divisible: f.divisible });
  if (f.tabId) and.push(inTab(f.tabId, tabs));
  if (f.missing != null) and.push(f.missing ? { id: { in: f.missingIds ?? [] } } : { id: { notIn: f.missingIds ?? [] } });
  if (f.q) {
    const q = { contains: f.q, mode: "insensitive" as const };
    const digits = f.q.replace(/\D/g, "");
    and.push({ OR: [
      { code: q }, { project: q }, { area: q }, { building: q },
      // owners are searched only by the people who see them (a hidden field is never searched: a match would tell it)
      ...(s.insider && s.owners?.name !== false ? [{ ownerName: q }] : []),
      ...(s.insider && s.owners?.phone !== false && digits.length >= 4 ? [{ ownerPhone: { contains: digits } }] : []),
    ] });
  }
  return { AND: and };
}
