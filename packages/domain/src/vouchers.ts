import { formatEGP, type Piasters } from "./money.ts";
import type { EntryLine } from "./ledger.ts";

/**
 * M-07 · treasury vouchers (9.2, 9.3, 9.11; the accountant's meeting, 4 Nov): every voucher is one balanced journal
 * entry. Names and kinds as in the demo («الخزن والحركات»).
 */
export const VOUCHER_KINDS = ["pay", "receive", "transfer", "advance", "custody", "settle"] as const;
export type VoucherKind = (typeof VOUCHER_KINDS)[number];
export const VOUCHER_LABEL: Record<VoucherKind, string> = {
  pay: "إذن صرف خزنة", receive: "إذن توريد خزنة", transfer: "تحويل بين خزن", advance: "سلفة موظف", custody: "عهدة", settle: "تسوية عهدة",
};
/** The chart's parents for a person's own account (docs/requirements/sources/chart-of-accounts.md): one sub-account per person. */
export const ADVANCES_PARENT = "131"; // سلف موظفين
export const CUSTODY_PARENT = "134"; // عهد
/** Where a receipt's other side may sit: «ايرادات اخري» (42) and its sub-accounts. */
export const OTHER_REVENUE = "42";

export interface VoucherSides {
  /** the safe / bank the money leaves (pay, transfer, advance, custody) */
  from?: string;
  /** the safe / bank the money enters (receive, transfer, settle's cash back) */
  to?: string;
  /** the expense (pay, settle), the revenue (receive), the person's 131/134 account (advance, custody, settle) */
  account?: string;
  /** the expense line a custody was spent on (settle) */
  expense?: string;
  amount: Piasters;
  /** settle only: spent on `expense` + returned to `to` */
  spent?: Piasters;
  returned?: Piasters;
}

/** The voucher's journal lines: debit where the value goes, credit where it came from. */
export function voucherLines(kind: VoucherKind, s: VoucherSides): EntryLine[] {
  const dr = (accountId: string, v: Piasters): EntryLine => ({ accountId, debit: v, credit: 0 });
  const cr = (accountId: string, v: Piasters): EntryLine => ({ accountId, debit: 0, credit: v });
  switch (kind) {
    case "pay": case "advance": case "custody": return [dr(s.account!, s.amount), cr(s.from!, s.amount)];
    case "receive": return [dr(s.to!, s.amount), cr(s.account!, s.amount)];
    case "transfer": return [dr(s.to!, s.amount), cr(s.from!, s.amount)];
    case "settle": {
      const spent = s.spent ?? 0, back = s.returned ?? 0;
      return [...(spent ? [dr(s.expense!, spent)] : []), ...(back ? [dr(s.to!, back)] : []), cr(s.account!, spent + back)];
    }
  }
}

/**
 * Why a voucher can't be saved, or null (the accountant's meeting, 4 Nov): no payment above the safe's balance, no
 * transfer to the same safe, no settlement above the custody.
 */
export function voucherProblem(kind: VoucherKind, s: VoucherSides, balances: { from?: Piasters; custody?: Piasters; fromName?: string }): string | null {
  const amount = kind === "settle" ? (s.spent ?? 0) + (s.returned ?? 0) : s.amount;
  if (!(amount > 0)) return kind === "settle" ? "اكتب اتصرف كام أو رجع كام" : "المبلغ لازم يبقى أكبر من صفر";
  if (kind === "transfer" && s.from === s.to) return "اختار خزنتين مختلفتين";
  if (kind === "settle" && amount > (balances.custody ?? 0)) return `المجموع أكبر من العهدة (${formatEGP(balances.custody ?? 0)})`;
  if (s.from && balances.from !== undefined && balances.from < amount) return `الرصيد في ${balances.fromName ?? "الخزنة"} (${formatEGP(balances.from)}) مش كفاية`;
  return null;
}

/* ---- the budget (9.2): spent = the line's account movements inside the budget's period ---- */
export const BUDGET_PERIODS = ["month", "quarter", "year"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];
export const BUDGET_PERIOD_LABEL: Record<BudgetPeriod, string> = { month: "شهري", quarter: "ربع سنوي", year: "سنوي" };

/** The first day of the period that contains `today` (YYYY-MM-DD, Cairo). */
export function periodStart(period: BudgetPeriod, today: string): string {
  const y = today.slice(0, 4), m = Number(today.slice(5, 7));
  if (period === "year") return `${y}-01-01`;
  if (period === "quarter") return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  return `${today.slice(0, 7)}-01`;
}

export type BudgetLevel = "ok" | "warn" | "bad" | "";
/** «قرّب يخلص» from the alert % (default 80), «عدّى البادجت» above 100%; no budget = no level. */
export function budgetLevel(spent: Piasters, budget: Piasters, alertPct = 80): BudgetLevel {
  if (!budget) return "";
  if (spent > budget) return "bad";
  return spent * 100 >= budget * alertPct ? "warn" : "ok";
}

/** The level a voucher just crossed into (notify once, when it changes), or null. */
export function budgetCrossed(before: Piasters, after: Piasters, budget: Piasters, alertPct = 80): "over" | "alert" | null {
  const was = budgetLevel(before, budget, alertPct), now = budgetLevel(after, budget, alertPct);
  if (now === "bad" && was !== "bad") return "over";
  if (now === "warn" && was === "ok") return "alert";
  return null;
}
