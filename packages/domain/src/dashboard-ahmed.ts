/**
 * Ahmed Islam's dashboard on one page (management, 16 Nov): the period picked (today / this week / this month / a
 * quarter) against the previous one up to the same point, the funnel, and where the target should be today.
 */
import { PLACES_CALENDAR, type WorkCalendar, dayStart, isWorkingDay, localDate } from "./business-time.ts";
import { weekOf } from "./broadcasts.ts";
import { previousQuarter } from "./kpi.ts";
import type { LeadStage } from "./leads.ts";
import type { Piasters } from "./money.ts";
import { quarterBounds, quarterOfDay } from "./period.ts";
import { monthBounds } from "./targets.ts";

export const DASH_PERIODS = ["today", "week", "month", "quarter"] as const;
export type DashPeriod = (typeof DASH_PERIODS)[number];

/** The funnel's stages in order (Not Interested, No Answer, Hold and Cancellation are off the road to a deal). */
export const FUNNEL_STAGES = ["Fresh", "Interested", "Visit", "Meeting", "Near to Close", "Done Deal"] as const satisfies readonly LeadStage[];

/** «Near to Close» this many days without a stage change is «محتاج انتباهك» (setting dashboardStaleNearClose). */
export const DEFAULT_STALE_NEAR_CLOSE_DAYS = 14;

export interface Window { from: Date; to: Date }

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * The period so far and the previous comparable one up to the same point: today vs yesterday at this time, the office
 * week / the month / the quarter vs the one before for as long. A quarter that ended counts whole; the previous one
 * never runs into the current one (a 31-day month after a 30-day one stops at its end).
 */
export function comparisonWindows(period: DashPeriod, now: Date, cal: WorkCalendar = PLACES_CALENDAR, quarter?: string): { current: Window; previous: Window } {
  const today = localDate(now, cal);
  let from: Date, end: Date, prevFrom: Date;
  if (period === "today") {
    from = dayStart(today, cal); end = dayStart(addDays(today, 1), cal); prevFrom = dayStart(addDays(today, -1), cal);
  } else if (period === "week") {
    const w = weekOf(now);
    from = dayStart(w.from, cal); end = dayStart(addDays(w.to, 1), cal); prevFrom = dayStart(addDays(w.from, -7), cal);
  } else if (period === "month") {
    const m = monthBounds(today.slice(0, 7), cal);
    from = m.from; end = m.to; prevFrom = monthBounds(m.prev, cal).from;
  } else {
    const q = quarter ?? quarterOfDay(today), b = quarterBounds(q, cal);
    from = b.from; end = b.to; prevFrom = quarterBounds(previousQuarter(q), cal).from;
  }
  const to = new Date(Math.min(Math.max(now.getTime(), from.getTime()), end.getTime()));
  const prevTo = new Date(Math.min(prevFrom.getTime() + (to.getTime() - from.getTime()), from.getTime()));
  return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
}

/** Working days (no Friday, no official holiday) from `from` to `to`, Cairo days, both included. */
export function workingDays(from: string, to: string, cal: WorkCalendar = PLACES_CALENDAR): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d, cal)) n++;
  return n;
}

/**
 * The target line: «المفروض نكون هنا النهارده» = goal × working days gone (today included) ÷ the period's working days,
 * and «محتاجين X في اليوم» = what's left ÷ the working days left (today included). perDay null = no day left, or done.
 */
export function targetPace(t: { goal: Piasters; achieved: Piasters; from: string; to: string; today: string }, cal: WorkCalendar = PLACES_CALENDAR): { expected: Piasters; perDay: Piasters | null } {
  const total = workingDays(t.from, t.to, cal);
  if (!total || t.goal <= 0) return { expected: 0, perDay: null };
  const upTo = (d: string) => (d < t.from ? 0 : workingDays(t.from, d < t.to ? d : t.to, cal));
  const expected = Math.round((t.goal * upTo(t.today)) / total);
  const left = total - upTo(addDays(t.today, -1)), missing = t.goal - t.achieved;
  return { expected, perDay: left > 0 && missing > 0 ? Math.ceil(missing / left) : null };
}

/** The share of one stage's count the next one has (Interested 40 → Visit 10 = 25%), one decimal; null with nothing to divide. */
export const conversionRate = (from: number, to: number): number | null => (from > 0 ? Math.round((to / from) * 1000) / 10 : null);

/** A team's colour by its quarter percent: green from 100%, amber 70–99%, red under 70% (no target = red). */
export const teamTone = (percent: number | null): "ok" | "warn" | "bad" => (percent == null ? "bad" : percent >= 100 ? "ok" : percent >= 70 ? "warn" : "bad");
