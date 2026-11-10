/**
 * «مهامي النهارده» (1.22, demo home.js): what is waiting for the person's action now, the late ones first.
 * Each module adds its own kind of item; the leads module gives the SLA alarms and the day's visits.
 */
import { type WorkCalendar, PLACES_CALENDAR, localDate } from "./business-time.ts";

/** «bad» = late (red, on top) · «warn» = waiting for a decision · "" = due today. */
export type InboxTone = "bad" | "warn" | "";

/**
 * A planned Visit / Meeting is on the board from its day on, until it is marked (Done / معملتهاش):
 * a past day is late, today is due, a later day isn't there yet (null). Days are Cairo days.
 */
export function visitDue(at: Date, now: Date, cal: WorkCalendar = PLACES_CALENDAR): InboxTone | null {
  const day = localDate(at, cal), today = localDate(now, cal);
  return day < today ? "bad" : day === today ? "" : null;
}

/**
 * Whose board shows the day's visits (demo home.js): the salesperson's own, the Team Leader's team, the admin's.
 * Operations see everyone's leads but not their visits.
 */
const VISIT_BOARD_ROLES: ReadonlySet<string> = new Set(["sales", "tl", "admin"]);
export const seesVisitsOnBoard = (roles: readonly string[]): boolean => roles.some((r) => VISIT_BOARD_ROLES.has(r));

/** The late ones first, otherwise in the order they came (demo: «مترتبة: المتأخر الأول»). */
export function inboxOrder<T extends { readonly tone: InboxTone }>(items: readonly T[]): T[] {
  return items.map((x, i) => ({ x, i })).sort((a, b) => Number(b.x.tone === "bad") - Number(a.x.tone === "bad") || a.i - b.i).map((y) => y.x);
}

/** A task assigned to me is on the board until it's done: red once its day has passed (demo home.js `t.due < today`). */
export const taskTone = (dueOn: string, today: string): InboxTone => (dueOn < today ? "bad" : "");

/**
 * The home's «عقد … بينتهي قريب · فرصة تجديد» (demo home.js): an Active contract ending within 30 days, its last day
 * included. The contracts screen's «قرّبت تخلص» filter keeps its own 90 days (RENEWAL_WINDOW_DAYS).
 */
export const HOME_RENEWAL_DAYS = 30;
export const renewalOnBoard = (daysLeft: number): boolean => daysLeft >= 0 && daysLeft <= HOME_RENEWAL_DAYS;
