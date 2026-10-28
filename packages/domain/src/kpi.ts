/**
 * M-12 · KPI cards (client file Places_KPIs_Q4_2026 + answers of 28/10).
 * Each item is scored proportionally and may pass 100% (recorded as is). The card score = Σ weight × achievement.
 * The money bands (salary or quarter bonus, per person) are the same for everyone and editable in settings.
 */
export type Measurement = "auto" | "handed-in" | "manual";
export type Direction = "at-least" | "at-most";

export interface KpiItem {
  readonly title: string;
  /** weight in percent; a card's weights add up to 100 */
  readonly weight: number;
  readonly direction: Direction;
  readonly goal: number;
  readonly measurement: Measurement;
}

/**
 * Achievement of one item as a fraction (1 = 100%).
 * at-least: actual ÷ goal, uncapped. at-most: met = 1, over → goal ÷ actual; a "zero" goal loses 25% per occurrence.
 */
export function achievement(item: Pick<KpiItem, "direction" | "goal">, actual: number): number {
  if (item.direction === "at-least") return item.goal > 0 ? actual / item.goal : 1;
  if (actual <= item.goal) return 1;
  return item.goal > 0 ? item.goal / actual : Math.max(0, 1 - 0.25 * actual);
}

/** Card score in percent, e.g. 92.5. */
export function cardScore(items: ReadonlyArray<KpiItem & { readonly actual: number }>): number {
  return items.reduce((sum, it) => sum + it.weight * achievement(it, it.actual), 0);
}

export const weightsAreValid = (items: readonly Pick<KpiItem, "weight">[]): boolean => items.reduce((s, it) => s + it.weight, 0) === 100;

export interface Bands {
  /** ≥ top: full bonus + reward% of it */
  readonly top: number;
  /** ≥ full: full bonus */
  readonly full: number;
  /** ≥ partial: partial bonus, the cut grows evenly from 0 at `full` to `cut`% at `partial` */
  readonly partial: number;
  /** below `partial`: cut% + improvement plan; below `low` (the Threshold): bonus cancelled + cut% of salary + written warning */
  readonly low: number;
  readonly rewardPercent: number;
  readonly cutPercent: number;
}
export const DEFAULT_BANDS: Bands = { top: 100, full: 96, partial: 70, low: 50, rewardPercent: 15, cutPercent: 15 };

export type BandName = "reward" | "full" | "partial" | "cut" | "threshold";
export const bandOf = (score: number, b: Bands = DEFAULT_BANDS): BandName =>
  score >= b.top ? "reward" : score >= b.full ? "full" : score >= b.partial ? "partial" : score >= b.low ? "cut" : "threshold";

export interface PaySetup {
  /** what the result moves: the monthly salary or the quarter bonus */
  readonly base: "salary" | "bonus";
  /** amount of that base, in piasters */
  readonly amount: number;
  /** monthly salary in piasters (used by the Threshold rule when the base is the bonus) */
  readonly monthlySalary: number;
}

/** Reward (+) or deduction (−) in piasters for a card score. */
export function payoutDelta(score: number, pay: PaySetup, b: Bands = DEFAULT_BANDS): number {
  const B = pay.amount;
  switch (bandOf(score, b)) {
    case "reward": return Math.round((B * b.rewardPercent) / 100);
    case "full": return 0;
    case "partial": return -Math.round(((B * b.cutPercent) / 100) * ((b.full - score) / (b.full - b.partial)));
    case "cut": return -Math.round((B * b.cutPercent) / 100);
    case "threshold": return pay.base === "bonus" ? -(B + Math.round((pay.monthlySalary * b.cutPercent) / 100)) : -Math.round((B * b.cutPercent) / 100);
  }
}
