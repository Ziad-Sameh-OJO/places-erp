/**
 * M-03 · the unit's numbers the system fills in by itself (M-03 3.2, 7.2) and the rules the inventory list reads.
 * Money is in piasters; areas are whole square metres (the sheet's «gross area»).
 */
import type { Piasters } from "./money.ts";
import type { Grants } from "./permissions.ts";

/** The unit sheets (M-03 3.1). Primary has the common columns only until the client sends its own. */
export const UNIT_TYPES = ["Rent", "Resale", "Income", "Primary"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];
export const UNIT_STATUSES = ["available", "rented", "sold"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

const checkArea = (area: number) => {
  if (!Number.isInteger(area) || area <= 0) throw new RangeError("area must be a positive whole number of m²");
};
const checkMoney = (p: Piasters) => {
  if (!Number.isInteger(p) || p < 0) throw new RangeError("price must be whole, non-negative piasters");
};

/** M-03 3.2: «total price تتحسب لوحدها price per meter x gross area». Rent: a month's rent; Resale / Income: the sale price. */
export function unitTotal(pricePerSqm: Piasters, area: number): Piasters {
  checkMoney(pricePerSqm);
  checkArea(area);
  return pricePerSqm * area;
}

export interface IncomeFigures {
  readonly saleTotal: Piasters;
  readonly monthlyRent: Piasters;
  readonly annualRent: Piasters;
  /** annual rent ÷ sale total × 100, to 2 decimals; null when there's no sale price to divide by */
  readonly yieldPct: number | null;
}

/**
 * Income units (M-03 7.2, «محتاج تأكيد»): annual rent = monthly rent × 12 · yield % = annual rent ÷ sale price total × 100.
 * The monthly rent is lease price per m² × area, as the client-approved demo computes it.
 */
export function incomeFigures(u: { salePerSqm: Piasters; leasePerSqm: Piasters; area: number }): IncomeFigures {
  const saleTotal = unitTotal(u.salePerSqm, u.area);
  const monthlyRent = unitTotal(u.leasePerSqm, u.area);
  const annualRent = monthlyRent * 12;
  return { saleTotal, monthlyRent, annualRent, yieldPct: saleTotal > 0 ? Math.round((annualRent * 10_000) / saleTotal) / 100 : null };
}

export type SplitPrice =
  | { readonly ok: true; readonly area: number; readonly price: Piasters }
  | { readonly ok: false; readonly reason: "not-divisible" | "below-minimum" | "above-space" };

/**
 * A divisible unit offered in part (M-03 Q20): the price is worked out for the area the client needs, with no
 * confirmation from Manar, as long as it isn't below the smallest part she set (minSplit) or above the unit itself.
 */
export function splitPrice(u: { divisible: boolean; minSplit: number | null; space: number; pricePerSqm: Piasters }, requested: number): SplitPrice {
  checkArea(requested);
  if (!u.divisible) return { ok: false, reason: "not-divisible" };
  if (u.minSplit && requested < u.minSplit) return { ok: false, reason: "below-minimum" };
  if (requested > u.space) return { ok: false, reason: "above-space" };
  return { ok: true, area: requested, price: unitTotal(u.pricePerSqm, requested) };
}

/** The largest amount a money column holds (Decimal(14,2)): 999,999,999,999.99. */
export const MAX_MONEY: Piasters = 99_999_999_999_999;

/**
 * Whether what the system works out for a unit can be stored and shown: the total (price × area) and, for Income,
 * a year's rent. A typo of a few extra zeros is refused instead of overflowing the sheet.
 */
export function unitFiguresFit(u: { pricePerSqm: Piasters | null; leasePerSqm: Piasters | null; area: number }): boolean {
  const fits = (perSqm: Piasters | null, times: number) => perSqm == null || perSqm * u.area * times <= MAX_MONEY;
  return fits(u.pricePerSqm, 1) && fits(u.leasePerSqm, 12);
}

/** M-03 2.4: the owner update is due every month; past that the unit is late (it stays visible to sales, Q21). */
export const STALE_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;

export function isStale(lastOwnerUpdateAt: Date, now: Date): boolean {
  return now.getTime() - lastOwnerUpdateAt.getTime() > STALE_AFTER_DAYS * DAY_MS;
}

/** The newest «last update» that is still on time: older than this is late (for queries). */
export const staleBefore = (now: Date): Date => new Date(now.getTime() - STALE_AFTER_DAYS * DAY_MS);

/**
 * The people who keep the inventory (Manar, Randa, the admin: whoever may add or edit units, M-03 Q18). Only they see
 * a unit before Manar confirms it (Q15: sales see it after the confirm) and the owners' names and numbers
 * (Manar's sheet has the owners' numbers; the one the sales see doesn't, M-03 1.2).
 */
export const keepsInventory = (g: Pick<Grants, "can">): boolean => g.can("inventory", "create") || g.can("inventory", "edit");

/**
 * M-03 7.2 · the area tabs under the list («101 to 200 · 201 to 500 · 501 to 800 · +»): Manar and Randa set the
 * ranges themselves (12.8), so nothing about them is fixed here. `max` null = «and above».
 */
export interface AreaRange { readonly min: number; readonly max: number | null }

/** «101 to 200», and «+800» for 801 and above — the sheet's own names. */
export const areaTabLabel = (t: AreaRange): string => (t.max == null ? `+${t.min - 1}` : `${t.min} to ${t.max}`);

/** Why a range can't be a tab (Arabic, shown as is), or null when it can. */
export function areaRangeProblem(t: AreaRange): string | null {
  if (!Number.isInteger(t.min) || t.min < 1) return "«من» لازم يبقى رقم صحيح من 1";
  if (t.max != null && (!Number.isInteger(t.max) || t.max < t.min)) return "«لحد» لازم يبقى أكبر من «من» أو زيه";
  return null;
}

/** Tabs in the order they're shown and matched: by «from», then the narrower one first. */
export function sortAreaTabs<T extends AreaRange>(tabs: readonly T[]): T[] {
  return [...tabs].sort((a, b) => a.min - b.min || (a.max ?? Infinity) - (b.max ?? Infinity));
}

export const inAreaRange = (space: number, t: AreaRange): boolean => space >= t.min && (t.max == null || space <= t.max);

/**
 * The tab a unit shows under: the one Manar picked when she entered it (M-03 3.2), otherwise the first range its
 * area falls in (the demo's «أوتوماتيك من المساحة»); null when it fits none.
 */
export function unitAreaTab<T extends AreaRange & { readonly id: string }>(u: { space: number; areaTabId: string | null }, tabs: readonly T[]): T | null {
  const picked = u.areaTabId ? tabs.find((t) => t.id === u.areaTabId) : undefined;
  return picked ?? sortAreaTabs(tabs).find((t) => inAreaRange(u.space, t)) ?? null;
}

/** M-03 Q16: a Done Deal closes a unit as rented (Rent) or sold (Resale, Income and Primary: «البيع بكل مشتقاته»). */
export const closedStatus = (type: UnitType): Exclude<UnitStatus, "available"> => (type === "Rent" ? "rented" : "sold");

/** The two sheets a unit can be on at once (Q17): its own type, and the second one Manar or Randa added. */
export type UnitSide = "type" | "also";
export interface UnitSides { readonly type: UnitType; readonly status: UnitStatus; readonly alsoType: UnitType | null; readonly alsoStatus: UnitStatus | null }

/** The side of the unit a deal of this type is on, or null when the unit isn't on that sheet at all (Q17). */
export function sideFor(u: UnitSides, dealType: UnitType): UnitSide | null {
  if (u.type === dealType) return "type";
  if (u.alsoType === dealType) return "also";
  return null;
}

/** Whether that side is still open: a deal can't close a side that is already rented or sold. */
export const sideOpen = (u: UnitSides, side: UnitSide): boolean => (side === "type" ? u.status : u.alsoStatus) === "available";

/** The role that confirms closing a unit of this type (Q16): Manar (Inventory Manager) the rent, Randa the rest. */
export const closeConfirmer = (type: UnitType): "inventory" | "resale" => (type === "Rent" ? "inventory" : "resale");

/** Q16: Manar confirms a rent close, Randa a resale / income one; the Super Admin can stand in for either. */
export const confirmsClose = (roles: readonly string[], type: UnitType): boolean => roles.includes("admin") || roles.includes(closeConfirmer(type));

/**
 * Q17: an edit can add, drop or swap the second type. Each type keeps the state it had (a rented Rent side stays
 * rented when Rent becomes the second type); a type new to the unit starts available.
 */
export function carrySides(before: UnitSides, after: { type: UnitType; alsoType: UnitType | null }): { status: UnitStatus; alsoStatus: UnitStatus | null } {
  const stateOf = (t: UnitType): UnitStatus => (t === before.type ? before.status : t === before.alsoType ? (before.alsoStatus ?? "available") : "available");
  return { status: stateOf(after.type), alsoStatus: after.alsoType ? stateOf(after.alsoType) : null };
}
