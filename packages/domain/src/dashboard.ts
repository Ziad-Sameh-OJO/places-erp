/**
 * 14.1–14.3 · the dashboards (management meeting, 15 Nov): management opens the system on how the company is doing,
 * not on their own KPIs. Each person has a stored layout: Ahmed Islam's (14.2), Safwat's (14.3), or the smaller one of
 * his role (his own numbers). «مهامي النهارده» stays its own page.
 */
import type { DataScope } from "./permissions.ts";
import type { LeadStage } from "./leads.ts";
import type { Piasters } from "./money.ts";
import { weekOf } from "./broadcasts.ts";

export const DASHBOARD_LAYOUTS = ["ahmed", "safwat", "role"] as const;
export type DashboardLayout = (typeof DASHBOARD_LAYOUTS)[number];
const COMPANY_LAYOUTS: readonly string[] = ["ahmed", "safwat"];

/**
 * The layout a person gets: a company layout only for one who sees the whole company's targets (reports, every
 * record): its numbers are the company's. Anyone else, or a stored key that isn't known, gets his role's dashboard.
 */
export function dashboardLayout(stored: string | null, who: { reportsView: boolean; scope: DataScope }): DashboardLayout {
  if (stored && COMPANY_LAYOUTS.includes(stored) && who.reportsView && who.scope === "all") return stored as DashboardLayout;
  return "role";
}

/** 14.1: the company dashboards are the first page their people see; everyone else still opens on «مهامي النهارده». */
export const opensOnDashboard = (layout: DashboardLayout): boolean => layout !== "role";

/** 14.2 «الشركة حسب المرحلة»: the stages counted (Not Interested left out), in the funnel's order. */
export const DASHBOARD_STAGES = ["Interested", "Visit", "Meeting", "Near to Close", "Done Deal"] as const satisfies readonly LeadStage[];

/** The periods a dashboard counts, from today's Cairo day: the office week (Saturday–Friday), the month, the quarter, the year. */
export interface DashboardPeriods {
  today: string;
  week: { from: string; to: string };
  month: string;
  /** `2026-Q4` */
  quarter: string;
  quarterMonths: [string, string, string];
  year: string;
  yearMonths: string[];
}

export function dashboardPeriods(today: string): DashboardPeriods {
  const y = today.slice(0, 4), m = Number(today.slice(5, 7)), q = Math.ceil(m / 3);
  const mm = (n: number) => `${y}-${String(n).padStart(2, "0")}`;
  return {
    today,
    week: weekOf(new Date(`${today}T10:00:00Z`)), // 12:00 Cairo: always the same day
    month: today.slice(0, 7),
    quarter: `${y}-Q${q}`,
    quarterMonths: [mm(q * 3 - 2), mm(q * 3 - 1), mm(q * 3)],
    year: y,
    yearMonths: Array.from({ length: 12 }, (_, i) => mm(i + 1)),
  };
}

/** A target bar: what was achieved out of the goal (600,000 of 1,000,000 → 60%), one decimal; null when there's no goal. */
export const targetProgress = (achieved: Piasters, goal: Piasters): number | null =>
  goal > 0 ? Math.round((achieved / goal) * 1000) / 10 : null;

/** A team's bar: its people's goals and achievements added up (not the average of their percents). */
export function teamProgress(members: readonly { goal: Piasters; achieved: Piasters }[]): { goal: Piasters; achieved: Piasters; percent: number | null } {
  const goal = members.reduce((s, m) => s + m.goal, 0), achieved = members.reduce((s, m) => s + m.achieved, 0);
  return { goal, achieved, percent: targetProgress(achieved, goal) };
}

/** 14.3 «Sales»: the first `n` by their target percent (no goal = last), then by what they achieved; nobody with neither. */
export function topSales<T extends { percent: number | null; achieved: Piasters }>(rows: readonly T[], n: number): T[] {
  return rows.filter((r) => r.percent != null || r.achieved > 0).sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || b.achieved - a.achieved).slice(0, n);
}

/** 14.3 «Top achiever»: the most achieved so far (an amount, not a percent); nobody when nothing was achieved yet. */
export function topAchiever<T extends { achieved: Piasters }>(rows: readonly T[]): T | null {
  return rows.reduce<T | null>((best, r) => (r.achieved > 0 && (!best || r.achieved > best.achieved) ? r : best), null);
}

/** 14.3 «مين جه متأخر من غير Excuse»: a late check-in that isn't an Excuse, a Visit or approved work outside. */
export const lateWithoutExcuse = (d: { kind: string; lateMinutes: number }): boolean => d.kind === "CHECKIN" && d.lateMinutes > 0;

/** 14.3 «Finance»: an expense line past its budget is broken (the mark next to it, as on the Office board). */
export const budgetBroken = (spent: Piasters, budget: Piasters | null): boolean => !!budget && budget > 0 && spent > budget;
