/**
 * «خطة التارجت» (management, 25 Nov): each salesperson's targets for every month of a year in one grid, the quarters and
 * the year as their sums. Typing a quarter's or the year's total spreads it over its months; a month that can't change
 * any more keeps its value and the rest share what's left.
 */
import { allocate } from "./money.ts";

/** What may be done to a month's target today (11.8): a past month is closed; the current one, after its first day,
 * changes only through an approval unless the person may approve; a coming month (or the 1st) changes at once. */
export type MonthLock = "closed" | "approval" | "open";
export function monthLock(month: string, today: string, canApprove: boolean): MonthLock {
  const now = today.slice(0, 7);
  if (month < now) return "closed";
  if (month === now && today.slice(8, 10) !== "01" && !canApprove) return "approval";
  return "open";
}

export const yearMonths = (year: number): string[] => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
/** The year's four quarters as their months: [["2026-01","2026-02","2026-03"], …]. */
export const yearQuarters = (year: number): string[][] => [0, 1, 2, 3].map((q) => yearMonths(year).slice(q * 3, q * 3 + 3));

/**
 * A total spread over its months: the fixed ones (closed) keep their amount, the others share the rest evenly — in
 * whole units (piasters for money, counts for Transactions and visits), the remainder on the first months. Nothing left
 * for the open months (the fixed ones already pass the total) gives them 0. No open month: unchanged.
 */
export function spreadTotal(total: number, current: readonly number[], fixed: readonly boolean[]): number[] {
  const open = current.flatMap((_, i) => (fixed[i] ? [] : [i]));
  if (!open.length) return [...current];
  const rest = Math.max(0, total - current.reduce((s, v, i) => s + (fixed[i] ? v : 0), 0));
  const parts = allocate(Math.round(rest), open.length);
  const out = [...current];
  open.forEach((i, k) => { out[i] = parts[k]!; });
  return out;
}
