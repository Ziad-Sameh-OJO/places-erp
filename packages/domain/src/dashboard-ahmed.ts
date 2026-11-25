/**
 * Ahmed Islam's dashboard on one page (management, 16 Nov): the period picked (today / this week / this month / a
 * quarter) against the previous one up to the same point, the funnel, and where the target should be today.
 */
import { PLACES_CALENDAR, type WorkCalendar, dayStart, isWorkingDay, localDate } from "./business-time.ts";
import { weekOf } from "./broadcasts.ts";
import { previousQuarter } from "./kpi.ts";
import type { LeadStage } from "./leads.ts";
import type { Piasters } from "./money.ts";
import { quarterBounds, quarterDays, quarterOfDay } from "./period.ts";
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

/** Cairo days, both included. */
export interface Days { from: string; to: string }

/** The period picked and the previous one as whole Cairo days (not cut at `now`: the charts show the days still to come). */
export function periodDays(period: DashPeriod, now: Date, cal: WorkCalendar = PLACES_CALENDAR, quarter?: string): { current: Days; previous: Days } {
  const today = localDate(now, cal);
  if (period === "today") return { current: { from: today, to: today }, previous: { from: addDays(today, -1), to: addDays(today, -1) } };
  if (period === "week") {
    const w = weekOf(now);
    return { current: w, previous: { from: addDays(w.from, -7), to: addDays(w.to, -7) } };
  }
  if (period === "month") {
    const from = `${today.slice(0, 7)}-01`, prevTo = addDays(from, -1), next = addDays(`${today.slice(0, 7)}-28`, 4).slice(0, 7);
    return { current: { from, to: addDays(`${next}-01`, -1) }, previous: { from: `${prevTo.slice(0, 7)}-01`, to: prevTo } };
  }
  const q = quarter ?? quarterOfDay(today);
  return { current: quarterDays(q), previous: quarterDays(previousQuarter(q)) };
}

const HOUR = 3_600_000;
/** `step`-day buckets from the first day; the last one stops at the period's end. */
const dayBuckets = (d: Days, step: number, cal: WorkCalendar): Window[] => {
  const out: Window[] = [], end = addDays(d.to, 1);
  for (let x = d.from; x <= d.to; x = addDays(x, step)) {
    const next = addDays(x, step);
    out.push({ from: dayStart(x, cal), to: dayStart(next < end ? next : end, cal) });
  }
  return out;
};
// shortcut: 24 one-hour buckets from Cairo midnight; a summer-time switch day's last hour is clipped, fine for a chart
const hourBuckets = (day: string, cal: WorkCalendar): Window[] => {
  const from = dayStart(day, cal).getTime(), end = dayStart(addDays(day, 1), cal).getTime();
  return Array.from({ length: 24 }, (_, h) => ({ from: new Date(Math.min(from + h * HOUR, end)), to: new Date(Math.min(from + (h + 1) * HOUR, end)) }));
};

/**
 * The new-leads trend (Ahmed's dashboard): today by hour, a week or a month by day, a quarter by 7-day week from its
 * first day. previous[i] is the same point of the previous period (yesterday's hour, last month's day i); a shorter
 * previous period has fewer points.
 */
export function trendBuckets(period: DashPeriod, now: Date, cal: WorkCalendar = PLACES_CALENDAR, quarter?: string): { unit: "hour" | "day" | "week"; current: Window[]; previous: Window[] } {
  const p = periodDays(period, now, cal, quarter);
  if (period === "today") return { unit: "hour", current: hourBuckets(p.current.from, cal), previous: hourBuckets(p.previous.from, cal) };
  const step = period === "quarter" ? 7 : 1;
  return { unit: step === 7 ? "week" : "day", current: dayBuckets(p.current, step, cal), previous: dayBuckets(p.previous, step, cal) };
}

/** The collections chart: today and the week by the office week's days, a month and a quarter by 7-day weeks. */
export function moneyBuckets(period: DashPeriod, now: Date, cal: WorkCalendar = PLACES_CALENDAR, quarter?: string): { unit: "day" | "week"; buckets: Window[] } {
  const daily = period === "today" || period === "week";
  return { unit: daily ? "day" : "week", buckets: dayBuckets(periodDays(daily ? "week" : period, now, cal, quarter).current, daily ? 1 : 7, cal) };
}

/** The sum of `value` of the rows dated inside each bucket (a count with value 1). */
export const sumIn = (rows: readonly { at: Date; value: number }[], buckets: readonly Window[]): number[] =>
  buckets.map((b) => rows.reduce((s, r) => (r.at >= b.from && r.at < b.to ? s + r.value : s), 0));

