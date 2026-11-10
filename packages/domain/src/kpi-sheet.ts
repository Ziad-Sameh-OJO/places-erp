/**
 * M-12 · 11.18 · the employee's quarterly sheet (voice notes 27/10: «ورقة كل موظف (PDF): فيها المرتب، والتارجت، والـ Scheme %،
 * والجوايز اللي بياخدها لو حقق حاجات معينة»): the lines management picks, and the award rules («لو حقق X% من التارجت ← جايزة»).
 * Demo clients.js sheetOf: the target is the quarter's months added up, the award is the biggest rule he reached.
 */
import { countsAsRevenue, splitDeal } from "./commission.ts";
import type { Piasters } from "./money.ts";
import { type DealRow, inPeriod, periodFigures, targetPercent } from "./targets.ts";

/** The sheet's lines in the demo's order and wording. */
export const SHEET_FIELDS = [
  ["salary", "المرتب"], ["target", "التارجت"], ["achieved", "دخل في التارجت"], ["scheme", "الـ Scheme %"],
  ["commission", "العمولة"], ["transactions", "الـ Transactions"], ["bonus", "الجوايز"],
] as const;
export type SheetField = (typeof SHEET_FIELDS)[number][0];
export const SHEET_FIELD_KEYS: readonly SheetField[] = SHEET_FIELDS.map(([k]) => k);
/** The demo's starting choice (data.js pdfFields). */
export const DEFAULT_SHEET_FIELDS: readonly SheetField[] = ["salary", "target", "achieved", "scheme", "commission", "bonus"];

export interface BonusRule { readonly minPct: number; readonly amount: Piasters }

/** The award for reaching `percent` of the target: the biggest rule reached (100% → 5,000 and 120% → 10,000 don't add up). */
export const bonusFor = (percent: number, rules: readonly BonusRule[]): Piasters =>
  rules.filter((r) => percent >= r.minPct).reduce((max, r) => Math.max(max, r.amount), 0);

/** The quarter's three months: `2026-Q4` → 2026-10, 2026-11, 2026-12. */
export function quarterMonths(q: string): [string, string, string] {
  const [y, n] = q.split("-Q").map(Number) as [number, number];
  const m = (i: number) => `${y}-${String((n - 1) * 3 + i).padStart(2, "0")}`;
  return [m(1), m(2), m(3)];
}

/** His commission in [from, to): his share of what was collected on his deals × his scheme (M-02 splitDeal). */
export function periodCommission(salesId: string, deals: readonly DealRow[], from: Date, to: Date, schemePercent: number): Piasters {
  return deals.map((d) => inPeriod(d, from, to)).filter(countsAsRevenue)
    .reduce((s, d) => s + splitDeal(d, () => schemePercent).filter((x) => x.salesId === salesId).reduce((a, x) => a + x.commission, 0), 0);
}

export interface SheetFigures { target: Piasters; achieved: Piasters; percent: number; commission: Piasters; transactions: number; bonus: Piasters }

/** The money lines of one salesperson's sheet for [from, to) against `target` (the quarter's months added up). */
export function sheetFigures(salesId: string, deals: readonly DealRow[], from: Date, to: Date, target: Piasters, schemePercent: number, rules: readonly BonusRule[]): SheetFigures {
  const f = periodFigures(salesId, deals, from, to), percent = targetPercent(f.achieved, target);
  return { target, achieved: f.achieved, percent, commission: periodCommission(salesId, deals, from, to, schemePercent), transactions: f.transactions,
    bonus: target > 0 ? bonusFor(percent, rules) : 0 };
}
