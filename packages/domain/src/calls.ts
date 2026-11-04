/**
 * M-01 3.1 · the call log the KPIs read (sources/kpis-q4-2026.md): Telesales makes 100 calls a day, salespeople
 * 50 a week («Calls & Broadcast»), and a new lead gets its first call within 30 minutes of arriving.
 */
import { PLACES_CALENDAR, type WorkCalendar, dayStart, localDate } from "./business-time.ts";

export const CALL_TARGETS = { telesalesPerDay: 100, salesPerWeek: 50, firstCallMinutes: 30 } as const;

/** Did the first call come within 30 minutes of the lead's arrival? null while nobody has called yet. */
export function firstCallOnTime(arrivedAt: Date, firstCallAt: Date | null, limitMinutes: number = CALL_TARGETS.firstCallMinutes): boolean | null {
  if (!firstCallAt) return null;
  return firstCallAt.getTime() - arrivedAt.getTime() <= limitMinutes * 60_000;
}

export interface CallGoal { readonly period: "day" | "week"; readonly target: number }

/** The call target a person's page shows (demo: «مكالماتك النهارده: … من 100» / «آخر 7 أيام: … من 50»). */
export function callGoal(roles: readonly string[]): CallGoal | null {
  if (roles.includes("telesales")) return { period: "day", target: CALL_TARGETS.telesalesPerDay };
  if (roles.includes("sales") || roles.includes("tl")) return { period: "week", target: CALL_TARGETS.salesPerWeek };
  return null;
}

/** Where the goal's count starts: today from Cairo midnight, the week as the last 7 days. */
export function callPeriodStart(goal: CallGoal, now: Date, cal: WorkCalendar = PLACES_CALENDAR): Date {
  return goal.period === "day" ? dayStart(localDate(now, cal), cal) : new Date(now.getTime() - 7 * 24 * 60 * 60_000);
}
