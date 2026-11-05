import { z } from "zod";
import type { DealRow } from "./deals.ts";
import type { TargetRow } from "./reports.ts";

/** One salesperson's line on a deal (the «تفاصيل الصفقات» sheet, M-02 6.1): share, what entered the target, commission. */
export interface DealShareRow {
  salesId: string; name: string; tl: string | null; side: "buyer" | "seller";
  share: string; targetShare: string; schemePercent: number; commission: string;
}
export interface DealPaymentRow { side: "owner" | "client"; amount: string; at: string }
export interface DealSheetRow extends DealRow {
  source: string; collectedOwner: string; collectedClient: string; collected: string; remaining: string;
  firstPaidAt: string | null; payments: DealPaymentRow[]; shares: DealShareRow[];
}
/** 5.9 · 5.10: every deal in the caller's scope with its money, and «لوحة الإيرادات» over the ones that count. */
export interface DealSheet {
  items: DealSheetRow[];
  totals: { expected: string; collected: string; remaining: string; commission: string; deals: number };
}

/** 5.10 · Achievements: the month's ranking of every salesperson (M-12 targets, 11.8). */
export const AchievementsQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });
export type AchievementsQuery = z.infer<typeof AchievementsQuery>;
/** `mine`: the caller's own employee id, for «إنجازاتي». */
export interface Achievements { month: string; label: string; mine: string | null; rows: Array<Omit<TargetRow, "pending">> }

/** «سجّل تحصيل»: the commission revenue lines (41…) the first collection is booked to. */
export interface DealCollectForm { incomes: Array<{ id: string; code: string; name: string }> }
