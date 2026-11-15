/**
 * M-05 · «المسار الوظيفي» (HR, 15 Nov): a track's levels (Junior → Senior → …) and the rule to reach each level,
 * all HR-editable. A rule = the last N closed quarters in a row each with total KPIs ≥ X% and target achievement ≥ Y%
 * (a quarter with no target skips the target check: «مالوش تارجت»), optionally a minimum of months in the current level.
 */

export interface PromotionRule {
  /** consecutive closed quarters needed */
  readonly quarters: number;
  /** total KPI score, % */
  readonly minKpi: number;
  /** target achievement, % */
  readonly minTarget: number;
  /** months in the current level; null = no minimum */
  readonly minMonths: number | null;
}

/** One closed quarter of one person: the KPI card's final score (null = no card) and target achievement (null = no target). */
export interface QuarterResult {
  readonly quarter: string;
  readonly kpi: number | null;
  readonly target: number | null;
}

export interface QuarterCheck extends QuarterResult {
  readonly kpiOk: boolean;
  /** null = no target that quarter (skipped) */
  readonly targetOk: boolean | null;
}

export type PromotionStatus = "due" | "near" | "notYet";

export interface PromotionCheck {
  readonly status: PromotionStatus;
  /** the rule's last N closed quarters, latest first (fewer when fewer have closed) */
  readonly quarters: readonly QuarterCheck[];
  readonly kpi: boolean;
  /** null = no target in any of those quarters («مالوش تارجت») */
  readonly target: boolean | null;
  /** null = the rule has no minimum */
  readonly months: boolean | null;
  /** good quarters in a row, counted back from the latest closed one */
  readonly streak: number;
}

/**
 * `closed`: the closed quarters, latest first. «مستحق ترقية» = every condition met; «قريب» = exactly one condition
 * unmet, or one more good quarter completes the run (and the months are no obstacle); otherwise not yet.
 */
export function promotionCheck(rule: PromotionRule, closed: readonly QuarterResult[], monthsInLevel: number): PromotionCheck {
  const n = Math.max(1, rule.quarters);
  const quarters = closed.slice(0, n).map((q): QuarterCheck => ({
    ...q, kpiOk: q.kpi !== null && q.kpi >= rule.minKpi, targetOk: q.target === null ? null : q.target >= rule.minTarget,
  }));
  const full = quarters.length === n;
  const kpi = full && quarters.every((q) => q.kpiOk);
  const target = full && quarters.every((q) => q.targetOk === null) ? null : full && quarters.every((q) => q.targetOk !== false);
  const months = rule.minMonths === null ? null : monthsInLevel >= rule.minMonths;
  const streak = quarters.findIndex((q) => !q.kpiOk || q.targetOk === false);
  const run = streak === -1 ? quarters.length : streak;
  const unmet = [kpi, target, months].filter((c) => c === false).length;
  const status: PromotionStatus = unmet === 0 ? "due" : unmet === 1 || (n > 1 && run === n - 1 && months !== false) ? "near" : "notYet";
  return { status, quarters, kpi, target, months, streak: run };
}

/** Whole months from `from` to `to` (both YYYY-MM-DD): 2026-01-15 → 2026-07-14 is 5, → 2026-07-15 is 6. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.max(0, (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0));
}
