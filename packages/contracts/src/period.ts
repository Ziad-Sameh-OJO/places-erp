import { z } from "zod";
import { periodId } from "@places/domain";
import { Id, Money } from "./common.ts";

/**
 * 14.12 · the «سنة + ربع» filter (Q4 2025 … Q2 2027) any screen with figures takes as `?year=2026&quarter=4`.
 * Both or neither: without them the screen shows what it showed before (the current month / quarter).
 */
export const PeriodQuery = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
});
export type PeriodQuery = z.infer<typeof PeriodQuery>;
/** The hand-typed figures are always of one quarter. */
export const HistoryQuery = PeriodQuery.required();
export type HistoryQuery = z.infer<typeof HistoryQuery>;
/** "2026-Q4", or null when no period was picked. */
export const periodOf = (q: PeriodQuery): string | null => (q.year && q.quarter ? periodId(q.year, q.quarter) : null);

/** A past quarter's figures typed by hand: the KPI result (%), the target and the achieved (EGP). */
export const HISTORICAL_KINDS = ["score", "target", "achieved"] as const;
export type HistoricalKind = (typeof HISTORICAL_KINDS)[number];
export const HistoricalFigureInput = z.object({
  year: z.number().int().min(2020).max(2100),
  quarter: z.number().int().min(1).max(4),
  employeeId: Id,
  kind: z.enum(HISTORICAL_KINDS, { errorMap: () => ({ message: "اختار الرقم ده إيه" }) }),
  value: Money,
  note: z.string().trim().max(300, "الملاحظة طويلة").optional(),
});
export type HistoricalFigureInput = z.infer<typeof HistoricalFigureInput>;

export interface HistoricalFigureRow {
  id: string; period: string; employeeId: string; name: string; kind: HistoricalKind; value: string; note: string | null; by: string; at: string;
}
export interface HistoricalFigures {
  period: string; label: string; rows: HistoricalFigureRow[];
  people: { id: string; name: string }[];
  can: { edit: boolean };
}
