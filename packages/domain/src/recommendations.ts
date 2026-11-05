/**
 * M-03 3.2 · 7.1 · M-01: the units the system suggests for a client (the lead's type, space, condition, budget and
 * area), and the narrowing questions that cut a long list down. Money in piasters, areas in whole m².
 */
import type { Piasters } from "./money.ts";
import type { UnitStatus, UnitType } from "./units.ts";

/**
 * «قريبة من» the space and the budget (M-03 7.2, needs-client: «مقترح ±20%»). The client hasn't confirmed it, so it's
 * a setting the admin edits; this is only its value until then.
 */
export const DEFAULT_RECOMMEND_TOLERANCE_PCT = 20;

/** What the lead says the client wants (M-01: Type · Space · Condition · Budget · Area). */
export interface ClientNeed {
  readonly type: string;
  readonly space: number | null;
  readonly condition: string | null;
  /** Rent: a month's rent · Resale / Income / Primary: the total price (M-03 7.2, proposed) */
  readonly budget: Piasters | null;
  readonly area: string;
}

/**
 * The narrowing questions (M-03 3.2: «أمثلة (مقترح، والكلاينت يحدد الأسئلة)»): the examples the requirements give,
 * as the demo asks them. An unanswered question narrows nothing.
 */
export interface NarrowingAnswers {
  readonly project?: string | undefined;
  /** «دور أرضي بس» */
  readonly floor?: "ground" | undefined;
  /** at least this many parking slots */
  readonly parking?: number | undefined;
  /** «نفس منطقة الكلاينت» */
  readonly area?: "same" | undefined;
  /** «مش عايز مساحة متقسمة» */
  readonly split?: "no" | undefined;
  readonly payment?: string | undefined;
  /** «محتاج delivery date قبل إمتى؟» (YYYY-MM-DD) */
  readonly deliveryBy?: string | undefined;
}

export interface RecommendableUnit {
  readonly id: string;
  readonly type: UnitType;
  readonly alsoType: UnitType | null;
  readonly status: UnitStatus;
  readonly alsoStatus: UnitStatus | null;
  readonly project: string;
  readonly area: string;
  readonly space: number;
  readonly condition: string;
  readonly floor: string | null;
  readonly parking: number;
  /** the price per m² of its own type (Rent: rent · the others: sale) */
  readonly pricePerSqm: Piasters | null;
  readonly divisible: boolean;
  readonly minSplit: number | null;
  readonly paymentMethod: string | null;
  /** Resale «delivery date»: a date (YYYY-MM-DD) or words like «فوري» */
  readonly delivery: string | null;
}

export interface Recommendation<U extends RecommendableUnit = RecommendableUnit> {
  readonly unit: U;
  /** suggested as a part of a bigger divisible unit (M-03 7.1: «ممكن تتقسم»), priced on the client's space */
  readonly split: boolean;
  /** the client's price: a month's rent for Rent, the total otherwise; null when the unit has no price for this type */
  readonly price: Piasters | null;
  readonly sameArea: boolean;
  /** the demo's «match %» */
  readonly match: number;
}

/** Whether the unit is open as this type: its own, or its second one (Q17: closing one side leaves the other open). */
export const offeredAs = (u: Pick<RecommendableUnit, "type" | "alsoType" | "status" | "alsoStatus">, type: string): boolean =>
  (u.type === type && u.status === "available") || (u.alsoType === type && u.alsoStatus === "available");

/** The space a unit may be offered at: within ± tolerance of the client's, or bigger and divisible down to it (Q20). */
export function spaceFit(u: Pick<RecommendableUnit, "space" | "divisible" | "minSplit">, need: number | null, tolerancePct: number): "fits" | "split" | null {
  if (need == null) return "fits";
  if (Math.abs(u.space - need) * 100 <= need * tolerancePct) return "fits";
  if (u.divisible && u.space > need && (!u.minSplit || u.minSplit <= need)) return "split";
  return null;
}

/** «دور أرضي»: how the sheet writes it (G, Ground, أرضي, 0). */
export const isGroundFloor = (floor: string | null): boolean => !!floor && /^(g|gf|ground|أرضي|ارضي|الأرضي|الارضي|0)$/i.test(floor.trim());

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A unit's delivery is in time when it's a date on or before the client's, or not a date at all («فوري»). */
export const deliveredBy = (delivery: string | null, by: string): boolean => !delivery || !DAY.test(delivery.trim()) || delivery.trim() <= by;

/** The ranking points (demo): same area 3 · same condition 2 · space within the range 2 · within the budget itself 1. */
const POINTS = { area: 3, condition: 2, space: 2, budget: 1 } as const;
const MATCH_BASE = 55;
const MATCH_PER_POINT = 5;
const MATCH_MAX = 99;

/**
 * M-03 3.2 · 7.1: the units for this client, best first. A unit is suggested when it is open as the client's type,
 * its space is within ± tolerance of theirs (or it's divisible and bigger), it has their finishing, and its price for
 * the space offered is within budget + tolerance. Then each answered question narrows the list. A missing space,
 * condition or budget on the lead narrows nothing.
 */
export function recommendUnits<U extends RecommendableUnit>(need: ClientNeed, units: readonly U[], answers: NarrowingAnswers, tolerancePct: number): Recommendation<U>[] {
  if (!Number.isFinite(tolerancePct) || tolerancePct < 0) throw new RangeError("tolerance must be a non-negative percentage");
  const out: Recommendation<U>[] = [];
  for (const u of units) {
    if (!offeredAs(u, need.type)) continue;
    const fit = spaceFit(u, need.space, tolerancePct);
    if (!fit) continue;
    if (need.condition && u.condition !== need.condition) continue;
    const split = fit === "split";
    // its own price per m² only: a dual unit offered as its second type has no price for it yet
    const perSqm = u.type === need.type ? u.pricePerSqm : null;
    const price = perSqm == null ? null : perSqm * (split ? need.space! : u.space);
    if (need.budget != null && price != null && price * 100 > need.budget * (100 + tolerancePct)) continue;
    if (!answered(u, need, answers, split)) continue;
    const sameArea = u.area === need.area;
    const score = (sameArea ? POINTS.area : 0) + (need.condition && u.condition === need.condition ? POINTS.condition : 0)
      + (split ? 0 : POINTS.space) + (need.budget == null || (price != null && price <= need.budget) ? POINTS.budget : 0);
    out.push({ unit: u, split, price, sameArea, match: Math.min(MATCH_MAX, MATCH_BASE + score * MATCH_PER_POINT) });
  }
  // the match grows with the points, so it ranks them
  return out.sort((a, b) => b.match - a.match || a.unit.space - b.unit.space || a.unit.id.localeCompare(b.unit.id));
}

/** The narrowing questions (demo recommend()): what the unit doesn't say (no payment method, no delivery) doesn't rule it out. */
function answered(u: RecommendableUnit, need: ClientNeed, a: NarrowingAnswers, split: boolean): boolean {
  if (a.project && u.project !== a.project) return false;
  if (a.floor === "ground" && !isGroundFloor(u.floor)) return false;
  if (a.parking && u.parking < a.parking) return false;
  if (a.area === "same" && u.area !== need.area) return false;
  if (a.split === "no" && split) return false;
  if (a.payment && u.paymentMethod && u.paymentMethod !== a.payment) return false;
  if (a.deliveryBy && !deliveredBy(u.delivery, a.deliveryBy)) return false;
  return true;
}

/** The smallest and largest space worth reading from the inventory for a client (the rest can only come in as a split). */
export function spaceWindow(need: number, tolerancePct: number): { min: number; max: number } {
  return { min: Math.ceil((need * (100 - tolerancePct)) / 100), max: Math.floor((need * (100 + tolerancePct)) / 100) };
}
