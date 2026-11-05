/**
 * M-12 · scheduled reports (11.10) and the daily report of every team (11.12), as agreed in the demo meeting of 4 Nov:
 * each report is sent by the system (auto) or handed in by people (handin), daily (working days only) / weekly on a
 * weekday / monthly on a day / quarterly on a day of the quarter's first month, at a Cairo time.
 */
import { type WorkCalendar, PLACES_CALENDAR, dayStart, isWorkingDay, localDate } from "./business-time.ts";

export type ReportFreq = "daily" | "weekly" | "monthly" | "quarterly";
export interface Schedule { readonly freq: ReportFreq; /** weekday 0–6 (Sunday = 0) or day of the month */ readonly day: number; /** "HH:MM" Cairo */ readonly time: string }

const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const onDay = (y: number, m: number, day: number) => `${y}-${String(m).padStart(2, "0")}-${String(Math.min(Math.max(1, day), daysIn(y, m))).padStart(2, "0")}`;

/**
 * This period's due moment for `now` (demo clients.js `dueOf`): today, this week's day (the week starts Sunday), this
 * month's day (the 31st is the month's last day) or that day in the quarter's first month. `period` is its local date:
 * one hand-in and one run per period.
 */
export function dueOf(s: Schedule, now: Date, cal: WorkCalendar = PLACES_CALENDAR): { period: string; due: Date } {
  const today = localDate(now, cal);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const period = s.freq === "daily" ? today
    : s.freq === "weekly" ? shift(today, s.day - new Date(`${today}T00:00:00Z`).getUTCDay())
    : s.freq === "monthly" ? onDay(y, m, s.day)
    : onDay(y, Math.floor((m - 1) / 3) * 3 + 1, s.day);
  const [h, min] = s.time.split(":").map(Number) as [number, number];
  return { period, due: new Date(dayStart(period, cal).getTime() + (h * 60 + min) * 60_000) };
}

/** Daily reports don't count on a day off (Friday, official holidays). */
export const isOffPeriod = (s: Schedule, period: string, cal: WorkCalendar = PLACES_CALENDAR): boolean => s.freq === "daily" && !isWorkingDay(period, cal);

/** «الجاي»: the next due moment from `now` on, skipping the days off of a daily report. */
export function nextDue(s: Schedule, now: Date, cal: WorkCalendar = PLACES_CALENDAR): Date {
  for (let d = 0; d < 400; d++) {
    const x = dueOf(s, new Date(now.getTime() + d * 86_400_000), cal);
    if (x.due >= now && !isOffPeriod(s, x.period, cal)) return x.due;
  }
  return now;
}

export type HandInStep = "remind" | "late" | null;
/** What the job does for one person who hasn't handed in yet: a reminder `remindMin` before the deadline, one late notice after it. */
export function handInStep(due: Date, remindMin: number, now: Date, done: { reminded: boolean; late: boolean }): HandInStep {
  if (now > due) return done.late ? null : "late";
  return !done.reminded && now.getTime() >= due.getTime() - remindMin * 60_000 ? "remind" : null;
}

/**
 * Who a report names (demo «U.whoEdit»): user ids, role keys, and "follower" = the person's follower (the hand-in's
 * person). Only active people; no duplicates.
 */
export function pickPeople(names: readonly string[], users: ReadonlyArray<{ id: string; roles: readonly string[] }>, follower: string | null = null): string[] {
  const out = new Set<string>();
  for (const n of names) {
    if (n === "follower") { if (follower) out.add(follower); continue; }
    for (const u of users) if (u.id === n || u.roles.includes(n)) out.add(u.id);
  }
  if (follower && !users.some((u) => u.id === follower)) out.delete(follower);
  return [...out];
}

// ───────── 11.12 · the daily report adds up ─────────

/** «آخر 7 أيام» (the day and the 6 before), «الشهر» and «الربع» up to the day: each the plain sum of the days in it. */
export function dailyTotals(days: ReadonlyArray<{ day: string; value: number }>, day: string): { day: number; week: number; month: number; quarter: number } {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const qStart = `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`, weekStart = shift(day, -6), monthStart = day.slice(0, 8) + "01";
  const sum = (from: string) => days.reduce((s, d) => (d.day >= from && d.day <= day ? s + d.value : s), 0);
  return { day: sum(day), week: sum(weekStart), month: sum(monthStart), quarter: sum(qStart) };
}

/**
 * The KPI value of a «اللي بيكتبه في التقرير اليومي» item (metric dailySum): the sum over its period (`per`, the quarter by
 * default), or with avg = "week" that sum per week gone by in the period.
 */
export function dailySumValue(days: ReadonlyArray<{ day: string; value: number }>, today: string, params: { per?: string | number; avg?: string | number }): number {
  const t = dailyTotals(days, today), per = params.per === "week" ? "week" : params.per === "month" ? "month" : "quarter";
  const total = t[per];
  if (params.avg !== "week") return total;
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const start = per === "week" ? shift(today, -6) : per === "month" ? today.slice(0, 8) + "01" : `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  const elapsed = (Date.UTC(y, m - 1, d) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
  return Math.round((total / Math.max(1, Math.ceil(elapsed / 7))) * 100) / 100;
}

/** How a day's report stands (11.12 «تقرير يوم»). */
export type DayStatus = "onTime" | "late" | "missing" | "off" | "open";
export function dayStatus(handedAt: Date | null, due: Date, now: Date, off: boolean): DayStatus {
  if (handedAt) return handedAt <= due ? "onTime" : "late";
  if (off) return "off";
  return now > due ? "missing" : "open";
}
