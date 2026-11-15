/**
 * M-05 · the ideal employee and the team fund (client sheet, 28/10).
 * Within a team, among members with total KPIs ≥ 80% and no administrative penalty this month:
 *   40% early-arrival days (more is better) + 30% lateness hours (less) + 30% days off without permission (less),
 *   each normalised against the rest of the team. Tie → higher target achievement, then higher KPI.
 * The winner receives the month's attendance & lateness deductions of the rest of the team.
 */
import type { Piasters } from "./money.ts";

export interface MemberMonth {
  readonly id: string;
  readonly earlyDays: number;
  readonly lateHours: number;
  readonly absentDays: number;
  /** this member's attendance & lateness deductions this month */
  readonly deductions: Piasters;
  /** null = no KPI card yet (not excluded for that) */
  readonly kpiScore: number | null;
  readonly targetPercent: number;
  readonly hasPenalty: boolean;
}

export interface IdealResult {
  readonly winner: string | null;
  readonly fund: Piasters;
  readonly points: ReadonlyMap<string, number>;
  /** the team's order: most points first, anyone with a penalty this month at the bottom (HR, 15 Nov) */
  readonly order: readonly string[];
}

export const MIN_KPI_FOR_IDEAL = 80;

export function idealEmployee(team: readonly MemberMonth[]): IdealResult {
  const max = (pick: (m: MemberMonth) => number) => Math.max(0, ...team.map(pick));
  const E = max((m) => m.earlyDays), L = max((m) => m.lateHours), A = max((m) => m.absentDays);
  const points = new Map(team.map((m) => [m.id,
    40 * (E ? m.earlyDays / E : 1) + 30 * (L ? 1 - m.lateHours / L : 1) + 30 * (A ? 1 - m.absentDays / A : 1)] as const));
  const eligible = team.filter((m) => (m.kpiScore === null || m.kpiScore >= MIN_KPI_FOR_IDEAL) && !m.hasPenalty);
  const winner = [...eligible].sort((a, b) =>
    points.get(b.id)! - points.get(a.id)! || b.targetPercent - a.targetPercent || (b.kpiScore ?? 0) - (a.kpiScore ?? 0))[0];
  const fund = winner ? team.filter((m) => m.id !== winner.id).reduce((s, m) => s + m.deductions, 0) : 0;
  const order = [...team].sort((a, b) => Number(a.hasPenalty) - Number(b.hasPenalty) || points.get(b.id)! - points.get(a.id)!).map((m) => m.id);
  return { winner: winner?.id ?? null, fund, points, order };
}

/**
 * The ideal employee by KPIs (HR, 15/11): everyone's total KPI score this quarter (out of 100%), highest first; the
 * highest is the ideal employee of the group (sales apart, Team Leaders apart). No card yet → listed last, never ideal.
 * A tie at the top makes every tied person ideal.
 */
export interface KpiRanked<T extends { readonly score: number | null }> { readonly rows: readonly (T & { rank: number | null; ideal: boolean })[] }

export function rankByKpi<T extends { readonly score: number | null }>(people: readonly T[]): KpiRanked<T> {
  const scored = people.filter((p) => p.score !== null).sort((a, b) => b.score! - a.score!);
  const top = scored[0]?.score ?? null;
  let rank = 0, last: number | null = null;
  const rows = scored.map((p, i) => { if (p.score !== last) { rank = i + 1; last = p.score; } return { ...p, rank, ideal: top !== null && top > 0 && p.score === top }; });
  return { rows: [...rows, ...people.filter((p) => p.score === null).map((p) => ({ ...p, rank: null, ideal: false }))] };
}
