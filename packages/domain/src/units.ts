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
 * M-03 2.2 · 3.2: the unit's PDF and slide are made by the system from its sheet and photos, and go to the sales and
 * their clients — so they carry the unit, never the owner (name, number), the agent or the commission (M-03 1.2: the
 * sales' sheet has no owners' numbers). 2.23 · the spec table of the client's files (2026-11-05), in English, per type.
 */
export const UNIT_SHEET_FIELDS: Record<UnitType, readonly (readonly [key: string, label: string])[]> = {
  // the client's slide row for row; its Commission row stays out (M-03 1.2, asked on the PR)
  Rent: [["project", "Building"], ["delivery", "Delivery date"], ["space", "Gross area"], ["condition", "Hand over Condition"], ["pricePerSqm", "Rent rate per meter"],
    ["maintenance", "Maintenance"], ["parking", "Parking slots"], ["upfront", "Upfront rent"], ["security", "Security deposit"], ["payment", "Payment"], ["term", "Term"], ["grace", "Grace period"], ["escalationPct", "Annual increase"]],
  Resale: [["project", "Building"], ["delivery", "Delivery date"], ["space", "Gross area"], ["condition", "Hand over Condition"], ["pricePerSqm", "Price per meter"], ["total", "Total price"],
    ["maintenance", "Maintenance"], ["parking", "Parking slots"], ["paymentMethod", "Payment"]],
  Income: [["project", "Building"], ["space", "Gross area"], ["pricePerSqm", "Sale price per meter"], ["total", "Total price"], ["monthly", "Monthly rent"], ["annual", "Annual rent"],
    ["yield", "Yield"], ["tenant", "Tenant"], ["contractDuration", "Contract"], ["escalationPct", "Annual increase"], ["paymentMethod", "Payment"]],
  Primary: [["project", "Building"], ["space", "Gross area"], ["condition", "Hand over Condition"], ["pricePerSqm", "Price per meter"], ["total", "Total price"], ["parking", "Parking slots"], ["paymentMethod", "Payment"]],
};

/**
 * M-03 3.1 «التقرير اليومي للانفنتوري»: the system counts the day — units entered, owner updates, rented / sold, and the
 * open units that aren't confirmed (a month without an update, or a PDF waiting for Manar) — and Manar approves it.
 */
export interface InventoryDayCounts { readonly newUnits: number; readonly updated: number; readonly closed: number; readonly unconfirmed: number }
export const INVENTORY_REPORT_LABELS: Record<keyof InventoryDayCounts, string> = { newUnits: "جديد", updated: "متحدّث", closed: "اتأجر / اتباع", unconfirmed: "مش مؤكد" };
/** «التقرير اليومي للانفنتوري: جديد 2 · متحدّث 5 · اتأجر / اتباع 1 · مش مؤكد 3» (the demo's message to the management). */
export const inventoryReportText = (c: InventoryDayCounts): string =>
  `التقرير اليومي للانفنتوري: ${(Object.keys(INVENTORY_REPORT_LABELS) as (keyof InventoryDayCounts)[]).map((k) => `${INVENTORY_REPORT_LABELS[k]} ${c[k]}`).join(" · ")}`;

/** M-03 3.1 KPI «مهام منار اليومية للفريق»: at most 30 tasks a day for each person (Sara, Marwa, Randa). */
export const TEAM_TASKS_PER_DAY = 30;
export const teamTaskRoom = (givenToday: number): number => Math.max(0, TEAM_TASKS_PER_DAY - givenToday);

/** M-03 3.1 KPI (Sara): the photos and PDF are up within 24 hours of the unit being entered. */
export const MEDIA_WITHIN_HOURS = 24;
export const mediaOnTime = (enteredAt: Date, uploadedAt: Date): boolean => uploadedAt.getTime() - enteredAt.getTime() <= MEDIA_WITHIN_HOURS * 3_600_000;

/** M-03 3.1 «pic or info»: how many photos one unit keeps (a Drive folder's worth; more is a mistake). */
export const MAX_UNIT_PHOTOS = 40;

/**
 * 2.22 · the unit's «Pic & Info» folder: the inventory's editors (Manar, Randa, whoever Manar gives edit) and the
 * inventory team (Sara, Marwa) upload, order and remove; everyone who sees the inventory opens and downloads.
 */
export const fillsUnitFolder = (roles: readonly string[], g: Pick<Grants, "can">): boolean => keepsInventory(g) || roles.includes("inventory_staff");

/**
 * The photos in the order Manar / Randa asked for (the first is the main one), or null when the order doesn't name
 * exactly the unit's photos, each once (a stale screen, or a photo removed meanwhile).
 */
export function photoOrder(current: readonly string[], wanted: readonly string[]): string[] | null {
  const have = new Set(current);
  if (wanted.length !== have.size || new Set(wanted).size !== wanted.length || !wanted.every((id) => have.has(id))) return null;
  return [...wanted];
}

/**
 * Q17: an edit can add, drop or swap the second type. Each type keeps the state it had (a rented Rent side stays
 * rented when Rent becomes the second type); a type new to the unit starts available.
 */
export function carrySides(before: UnitSides, after: { type: UnitType; alsoType: UnitType | null }): { status: UnitStatus; alsoStatus: UnitStatus | null } {
  const stateOf = (t: UnitType): UnitStatus => (t === before.type ? before.status : t === before.alsoType ? (before.alsoStatus ?? "available") : "available");
  return { status: stateOf(after.type), alsoStatus: after.alsoType ? stateOf(after.alsoType) : null };
}

/**
 * 2.20 · the columns a unit of each type counts as missing while empty (demo inventory.js `A.missingOf`): every column
 * of its sheet except the computed ones (Total · rent · Yield · PIC · Resale), the optional ones (Comment · Layout ·
 * Floor · Parking · Escalation · Note) and the system's (Code · Agent · Last update). Labels are the sheet's own,
 * Rent's in the client's order (Book7, 2.21). Primary has no sheet of its own yet, so it is checked as Rent (the demo's fallback; needs-client).
 */
const RENT_MISSING: readonly (readonly [key: string, label: string])[] = [
  ["project", "Project"], ["photos", "Pic & Info"], ["space", "Area"], ["condition", "Conditions"], ["pricePerSqm", "Price/Sqm"], ["maintenance", "Maintenance"],
  ["commission", "Commission"], ["building", "Building Number"], ["location", "Location"], ["ownerName", "Contact"], ["ownerPhone", "Number"],
];
export const MISSING_COLUMNS: Record<UnitType, readonly (readonly [key: string, label: string])[]> = {
  Rent: RENT_MISSING,
  Resale: [["project", "اسم المبنى"], ["ownerName", "اسم الأونر"], ["ownerPhone", "الرقم"], ["space", "المساحة"], ["condition", "التشطيب"], ["pricePerSqm", "السعر للمتر"],
    ["paymentMethod", "طريقة الدفع"], ["maintenance", "صيانة"], ["building", "رقم المبنى"], ["commission", "Commission"], ["delivery", "Delivery date"], ["photos", "Pictures"]],
  Income: [["project", "اسم المبنى"], ["ownerName", "الاسم"], ["ownerPhone", "الرقم"], ["link", "اللينك"], ["space", "Area"], ["pricePerSqm", "Sale / m"], ["leasePerSqm", "Lease / m"],
    ["contractDuration", "Contract"], ["startsOn", "Start"], ["endsOn", "End"], ["paymentMethod", "Payment"], ["building", "Building"], ["serviceChargeUsd", "Service $/m"],
    ["tenant", "Tenant"], ["commission", "Commission"]],
  Primary: RENT_MISSING,
};

/** A unit as the check reads it: its columns, the one-type columns in `details`, and how many photos its folder has. */
export interface MissingInput { readonly type: UnitType; readonly photoCount: number; readonly details?: unknown; readonly [column: string]: unknown }

/**
 * 2.20: the names of the unit's empty columns (empty text, nothing, or 0); the photos are missing while the folder is
 * empty. The unit is saved anyway; the alert stays on «مهامي النهارده» until this is empty.
 */
export function missingFields(u: MissingInput): string[] {
  const details = (u.details ?? {}) as Record<string, unknown>;
  const value = (k: string) => (k === "photos" ? u.photoCount : (u[k] ?? details[k]));
  return MISSING_COLUMNS[u.type].filter(([k]) => { const v = value(k); return v == null || v === "" || v === 0; }).map(([, label]) => label);
}

/** Whose «مهامي النهارده» shows a unit's missing data: Manar the Rent units, Randa the rest, the admin all (demo home.js). */
export const seesMissingOf = confirmsClose;
