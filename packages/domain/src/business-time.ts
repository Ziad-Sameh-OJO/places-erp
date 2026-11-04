/**
 * Working time in Cairo. SLAs (lead pull after 3 working hours, ticket replies, HR letters…) count only
 * working minutes: 11:00–19:00 local, no Fridays, no official holidays (M-01 Q4, M-13).
 * All instants are stored in UTC; this module converts to Cairo wall-clock time to decide what is "working time".
 */
export interface WorkCalendar {
  /** minutes after local midnight the working day starts / ends (11:00 = 660, 19:00 = 1140) */
  readonly startMinute: number;
  readonly endMinute: number;
  /** 0 = Sunday … 6 = Saturday */
  readonly weekendDays: readonly number[];
  /** official holidays as local dates "YYYY-MM-DD" */
  readonly holidays: ReadonlySet<string>;
  readonly timeZone: string;
}

export const PLACES_CALENDAR: WorkCalendar = {
  startMinute: 11 * 60,
  endMinute: 19 * 60,
  weekendDays: [5],
  holidays: new Set(),
  timeZone: "Africa/Cairo",
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Offset of `tz` from UTC at `instant`, in ms (Cairo is +2h or +3h depending on daylight saving). */
function offsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The local calendar date ("YYYY-MM-DD") of an instant. */
export function localDate(instant: Date, cal: WorkCalendar = PLACES_CALENDAR): string {
  return new Date(instant.getTime() + offsetMs(instant, cal.timeZone)).toISOString().slice(0, 10);
}

/**
 * The instant a local day starts, in UTC: date filters («from 1/10 to 15/10») mean Cairo days. Two passes, because the
 * offset at UTC midnight can differ from the offset at local midnight on a daylight-saving day.
 */
export function dayStart(isoDate: string, cal: WorkCalendar = PLACES_CALENDAR): Date {
  const utcMidnight = Date.parse(`${isoDate}T00:00:00Z`);
  let t = utcMidnight - offsetMs(new Date(utcMidnight), cal.timeZone);
  t = utcMidnight - offsetMs(new Date(t), cal.timeZone);
  return new Date(t);
}

export function isWorkingDay(isoDate: string, cal: WorkCalendar = PLACES_CALENDAR): boolean {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return !cal.weekendDays.includes(weekday) && !cal.holidays.has(isoDate);
}

/**
 * Working minutes between two instants. Works in local wall-clock time: each local day contributes the
 * overlap of [from, to] with its working window. O(days between), capped at `maxDays` as a safety net.
 */
export function workingMinutesBetween(from: Date, to: Date, cal: WorkCalendar = PLACES_CALENDAR, maxDays = 400): number {
  if (to <= from) return 0;
  const a = from.getTime() + offsetMs(from, cal.timeZone);
  const b = to.getTime() + offsetMs(to, cal.timeZone);
  let total = 0;
  for (let day = Math.floor(a / DAY) * DAY, n = 0; day <= b && n < maxDays; day += DAY, n++) {
    if (!isWorkingDay(new Date(day).toISOString().slice(0, 10), cal)) continue;
    const start = Math.max(a, day + cal.startMinute * MINUTE);
    const end = Math.min(b, day + cal.endMinute * MINUTE);
    if (end > start) total += (end - start) / MINUTE;
  }
  return Math.floor(total);
}

export const wallClockMinutesBetween = (from: Date, to: Date): number => Math.max(0, Math.floor((to.getTime() - from.getTime()) / MINUTE));
