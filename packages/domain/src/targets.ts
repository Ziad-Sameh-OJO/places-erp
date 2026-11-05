/**
 * M-12 · monthly targets (11.8): a salesperson's achievement in a period is his share of what was collected on his deals
 * in that period (M-02 splitDeal, targetAchieved); a Transaction counts in the month of the deal's first collection.
 * Example from the client: 1.5M achieved of a 3M target → 50%.
 */
import { type DealMoney, type DealStatus, countsAsRevenue, splitDeal, transactionsOf, targetAchieved } from "./commission.ts";
import { type Piasters, fromDecimal } from "./money.ts";
import type { TlTier } from "./team-leader.ts";
import { type WorkCalendar, PLACES_CALENDAR, dayStart } from "./business-time.ts";

export interface DealRow extends Omit<DealMoney, "payments"> {
  readonly payments: ReadonlyArray<{ readonly side: "owner" | "client"; readonly amount: Piasters; readonly at: Date }>;
}

const firstAt = (d: DealRow) => d.payments.reduce<Date | null>((min, p) => (!min || p.at < min ? p.at : min), null);
const within = (t: Date | null, from: Date, to: Date) => !!t && t >= from && t < to;

/**
 * The deal as seen from one period: only the collections inside it. A «note» override (targetBase) is a fixed figure,
 * so it counts once, in the period of the first collection.
 */
export function inPeriod(d: DealRow, from: Date, to: Date): DealMoney {
  const payments = d.payments.filter((p) => within(p.at, from, to));
  return { ...d, payments, targetBase: d.targetBase == null ? null : within(firstAt(d), from, to) ? d.targetBase : 0 };
}

/** `achieved` goes into the target; `share` (his part of what was collected) is what the TL's percentage is taken from. */
export function periodFigures(salesId: string, deals: readonly DealRow[], from: Date, to: Date): { achieved: Piasters; share: Piasters; transactions: number } {
  const seen = deals.map((d) => inPeriod(d, from, to));
  return {
    achieved: targetAchieved(salesId, seen, () => 0),
    share: seen.filter(countsAsRevenue).reduce((s, d) => s + splitDeal(d, () => 0).filter((x) => x.salesId === salesId).reduce((a, x) => a + x.share, 0), 0),
    transactions: transactionsOf(salesId, deals.filter((d) => within(firstAt(d), from, to))),
  };
}

export const targetPercent = (achieved: Piasters, goal: Piasters): number => (goal > 0 ? (achieved / goal) * 100 : 0);

/** Demo clients.js «تحت المعدل»: below 60% of the share of the month gone by — the TL hears of it. */
export const behindPace = (percent: number, dayOfMonth: number, daysInMonth: number): boolean => percent < (dayOfMonth / daysInMonth) * 100 * 0.6;

/** «الترتيب»: highest achievement first; equal percentages share a rank. */
export function ranked<T extends { percent: number }>(rows: readonly T[]): Array<T & { rank: number }> {
  const sorted = [...rows].sort((a, b) => b.percent - a.percent);
  return sorted.map((r) => ({ ...r, rank: sorted.findIndex((x) => x.percent === r.percent) + 1 }));
}

const STATUS: Record<string, DealStatus> = {
  PENDING_REVIEW: "Pending Review", APPROVED: "Approved", PARTIALLY_COLLECTED: "Partially Collected", FULLY_COLLECTED: "Fully Collected", REJECTED: "Rejected", CANCELLED: "Cancelled",
};
/** A stored deal (sales.Deal, its participants and payments; decimals as strings) as the rules read it. */
export function dealRowOf(d: {
  status: string; commissionOwner: string; commissionClient: string; targetBase: string | null; offTarget: boolean;
  participants: ReadonlyArray<{ employeeId: string; side: string; approved: boolean }>;
  payments: ReadonlyArray<{ side: string; amount: string; receivedAt: Date }>;
}): DealRow {
  const sellers = d.participants.filter((p) => p.side === "SELLER");
  return {
    status: STATUS[d.status] ?? "Pending Review", commissionOwner: fromDecimal(d.commissionOwner), commissionClient: fromDecimal(d.commissionClient),
    targetBase: d.targetBase == null ? null : fromDecimal(d.targetBase), offTarget: d.offTarget,
    buyers: d.participants.filter((p) => p.side === "BUYER").map((p) => p.employeeId), sellers: sellers.map((p) => p.employeeId),
    sellerApproved: sellers.every((p) => p.approved),
    payments: d.payments.map((p) => ({ side: p.side === "client" ? "client" : "owner", amount: fromDecimal(p.amount), at: p.receivedAt })),
  };
}

/** A Cairo month "YYYY-MM" as [from, to) instants, its length, and the month before. */
export function monthBounds(month: string, cal: WorkCalendar = PLACES_CALENDAR): { from: Date; to: Date; days: number; prev: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const iso = (yy: number, mm: number) => `${yy + Math.floor((mm - 1) / 12)}-${String(((mm - 1) % 12 + 12) % 12 + 1).padStart(2, "0")}`;
  return { from: dayStart(`${month}-01`, cal), to: dayStart(`${iso(y, m + 1)}-01`, cal), days: new Date(Date.UTC(y, m, 0)).getUTCDate(), prev: iso(y, m - 1) };
}

/** TL tiers as stored (Setting tlTiers): `below` null = «وأكتر». */
export const tlTiersOf = (v: unknown): TlTier[] =>
  Array.isArray(v) ? v.flatMap((t: { below?: unknown; percent?: unknown }) => (typeof t?.percent === "number" ? [{ below: typeof t.below === "number" ? t.below : Infinity, percent: t.percent }] : [])) : [];
