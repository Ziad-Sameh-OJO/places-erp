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
