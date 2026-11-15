/**
 * 14.12 · the «سنة + ربع» filter on every screen with figures (management meeting, 15 Nov): a period is a calendar
 * quarter, written "2026-Q4" like the KPI quarters. Days are Cairo days; the range is [from, to).
 */
import { PLACES_CALENDAR, type WorkCalendar, dayStart, localDate } from "./business-time.ts";
import { quarterMonths } from "./kpi-sheet.ts";
import { nextQuarter, previousQuarter, quarterLabel } from "./kpi.ts";

/** The oldest quarter the filter offers: Q4 2025, the first one management types in by hand. */
export const FIRST_PERIOD = "2025-Q4";

export const periodId = (year: number, quarter: number): string => `${year}-Q${quarter}`;

/** The quarter a Cairo day falls in: "2026-11-15" → "2026-Q4". */
export const quarterOfDay = (day: string): string => periodId(Number(day.slice(0, 4)), Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1);

/** The quarter's first and last Cairo day, both included (the leads' «من / لحد» filter): "2026-Q4" → 2026-10-01 … 2026-12-31. */
export function quarterDays(q: string): { from: string; to: string } {
  const [first, , last] = quarterMonths(q);
  const [y, m] = last.split("-").map(Number) as [number, number];
  return { from: `${first}-01`, to: `${last}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
}

/** The quarter as instants [from, to): Cairo midnight of its first day and of the next quarter's first day. */
export function quarterBounds(q: string, cal: WorkCalendar = PLACES_CALENDAR): { from: Date; to: Date } {
  return { from: dayStart(quarterDays(q).from, cal), to: dayStart(quarterDays(nextQuarter(q)).from, cal) };
}

/** The filter's choices, latest first: from Q4 2025 up to `ahead` quarters after today's (negative: before it). */
export function periodChoices(now: Date, ahead = 2, cal: WorkCalendar = PLACES_CALENDAR): { id: string; label: string }[] {
  let last = quarterOfDay(localDate(now, cal));
  for (let i = 0; i < Math.abs(ahead); i++) last = ahead > 0 ? nextQuarter(last) : previousQuarter(last); // -1: only quarters that ended
  const out: string[] = [];
  for (let q = FIRST_PERIOD; q <= last; q = nextQuarter(q)) out.push(q);
  return out.reverse().map((id) => ({ id, label: quarterLabel(id) }));
}

/** 14.12: figures typed by hand are for a quarter that already ended (from Q4 2025); the live quarters compute their own. */
export function historicalProblem(period: string, now: Date, cal: WorkCalendar = PLACES_CALENDAR): string | null {
  if (period < FIRST_PERIOD) return `الأرقام اليدوي من ${quarterLabel(FIRST_PERIOD)} وبعدها`;
  return period >= quarterOfDay(localDate(now, cal)) ? `${quarterLabel(period)} لسه ماخلصش · الأرقام اليدوي للأرباع اللي فاتت بس` : null;
}
