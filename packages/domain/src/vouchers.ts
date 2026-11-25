import { formatEGP, type Piasters } from "./money.ts";
import type { EntryLine } from "./ledger.ts";

/**
 * M-07 · treasury vouchers (9.2, 9.3, 9.11; the accountant's meeting, 4 Nov): every voucher is one balanced journal
 * entry. Names and kinds as in the demo («الخزن والحركات»).
 */
export const VOUCHER_KINDS = ["pay", "receive", "transfer", "advance", "custody", "settle"] as const;
export type VoucherKind = (typeof VOUCHER_KINDS)[number];
export const VOUCHER_LABEL: Record<VoucherKind | "payroll" | "commission", string> = {
  payroll: "صرف مرتبات", commission: "صرف عمولة سيلز",
  pay: "إذن صرف خزنة", receive: "إذن توريد خزنة", transfer: "تحويل بين خزن", advance: "سلفة موظف", custody: "عهدة", settle: "تسوية عهدة",
};
/** The chart's parents for a person's own account (docs/requirements/sources/chart-of-accounts.md): one sub-account per person. */
export const ADVANCES_PARENT = "131"; // سلف موظفين
export const CUSTODY_PARENT = "134"; // عهد
/** 9.12 (4 Nov tree): a client's own account under «عملاء», a salesperson's under «عمولة مبيعات مستحقة», booked against «عمولة مبيعات». */
export const CLIENTS_PARENT = "113";
export const SALES_COMMISSION_PARENT = "21103";
export const SALES_COMMISSION_EXPENSE = "5302";
/** 5.8 (4 Nov): a Team Leader's commission is due on their own account under 21103 too, booked against «عمولة تيم ليدر». */
export const TL_COMMISSION_EXPENSE = "5305";
/** 9.6: the operations commission, owed on «عمولة اوبريشن مستحقة»; the external one on a sub-account the system opens under 211 (the tree has none yet · needs-client). */
export const OPS_COMMISSION_EXPENSE = "5303";
export const OPS_COMMISSION_DUE = "21104";
export const EXTERNAL_COMMISSION_EXPENSE = "5304";
export const ACCRUED_PARENT = "211";
export const EXTERNAL_COMMISSION_DUE_NAME = "عمولات خارجية مستحقة";
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

/* ---- recurring bills (9.16; the accountant's meeting, 4 Nov): nothing pays by itself ---- */
export type BillState = "paid" | "skipped" | "off" | "due" | "soon" | "later";
export const BILL_STATE_LABEL: Record<BillState, string> = {
  paid: "اتصرفت الشهر ده", skipped: "اتأجلت الشهر ده", off: "متوقفة", due: "ميعادها جه · مستنية موافقتك", soon: "قرّبت", later: "لسه",
};
/** A bill's state this month (demo billState): paid / skipped win, then off, then due from its day on, «قرّبت» 3 days before. */
export function billState(bill: { day: number; active: boolean }, thisMonth: "paid" | "skipped" | null, today: string): BillState {
  if (thisMonth) return thisMonth;
  if (!bill.active) return "off";
  const day = Number(today.slice(8, 10));
  if (day >= bill.day) return "due";
  return bill.day - day <= 3 ? "soon" : "later";
}

/* ---- payroll (9.14; the accountant's meeting, 4 Nov) ---- */
export const SALES_SALARIES = "5301"; // مرتبات مبيعات
export const ADMIN_SALARIES = "5202"; // مرتبات ادارية
const SALES_ROLES = new Set(["sales", "tl", "telesales"]);
/** Which salaries account a person's pay goes to (demo salLine): sales roles → 5301, everyone else → 5202. */
export const salaryLine = (roles: readonly string[]): "sales" | "admin" => (roles.some((r) => SALES_ROLES.has(r)) ? "sales" : "admin");

const shiftMonth = (month: string, by: number): string => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
export const nextMonth = (month: string): string => shiftMonth(month, 1);

/**
 * Which month a payroll run pays (and whose deductions HR approves): in the first half of a month (day ≤ 15) the
 * previous one — paying on 1 Nov pays October with October's deductions — otherwise the current one (developer's
 * decision on the review, 25 Nov).
 */
export const payrollMonth = (today: string): string => (Number(today.slice(8, 10)) <= 15 ? shiftMonth(today.slice(0, 7), -1) : today.slice(0, 7));

/** The day a month's payroll falls due: a pay day ≤ 15 is in the month after it (paid as «last month»), a later one in the month itself. */
export const payrollDueDate = (month: string, payDay: number): string => `${payDay <= 15 ? nextMonth(month) : month}-${String(payDay).padStart(2, "0")}`;

/** Where the employees' insurance deductions are owed until paid to the insurer (chart: «تامينات اجتماعية مستحقة»). */
export const INSURANCE_DUE = "21105";
export interface PayRowInput { salary: Piasters; attendance: Piasters; advanceLeft: Piasters; advancePlan: Piasters | null; insurance?: Piasters }
export interface PayRow { salary: Piasters; attendance: Piasters; insurance: Piasters; advance: Piasters; net: Piasters }
/**
 * One person's pay (demo payRows): salary − attendance deduction (after HR approves) − the monthly insurance
 * deduction HR recorded (HR, 15 Nov) − the advance deduction the accountant chose (default: everything left; never
 * more than what's left or than the pay itself).
 */
export function payRow(i: PayRowInput): PayRow {
  const afterAttendance = Math.max(0, i.salary - i.attendance);
  const insurance = Math.max(0, Math.min(i.insurance ?? 0, afterAttendance)), afterInsurance = afterAttendance - insurance;
  const advance = Math.max(0, Math.min(i.advanceLeft, i.advancePlan ?? i.advanceLeft, afterInsurance));
  return { salary: i.salary, attendance: Math.min(i.attendance, i.salary), insurance, advance, net: afterInsurance - advance };
}

/** The month's insurance deduction (HR, 15 Nov): an insured person's monthly amount, from the month it starts. */
export const insuranceDue = (i: { insured: boolean; since: string | null; monthly: Piasters } | undefined, month: string): Piasters =>
  i?.insured && (!i.since || i.since.slice(0, 7) <= month) ? i.monthly : 0;

/**
 * The single payroll entry: debit 5202 / 5301 with the gross salaries; credit each person's advance account with its
 * deduction, the attendance deductions (a reduction of the salaries expense), the insurance withheld (21105) and the
 * safe / bank with the net.
 */
export function payrollLines(rows: readonly (PayRow & { line: "sales" | "admin"; advanceAccount?: string })[], accounts: { admin: string; sales: string; from: string; insurance?: string }): EntryLine[] {
  const sum = (f: (r: PayRow) => number, line?: "sales" | "admin") => rows.filter((r) => !line || r.line === line).reduce((s, r) => s + f(r), 0);
  // the expense is what was earned: salary − attendance deductions, split by line
  const admin = sum((r) => r.salary - r.attendance, "admin"), sales = sum((r) => r.salary - r.attendance, "sales");
  const out: EntryLine[] = [];
  if (admin) out.push({ accountId: accounts.admin, debit: admin, credit: 0 });
  if (sales) out.push({ accountId: accounts.sales, debit: sales, credit: 0 });
  for (const r of rows) if (r.advance && r.advanceAccount) out.push({ accountId: r.advanceAccount, debit: 0, credit: r.advance });
  // the employees' share is withheld from their pay and owed to the insurer
  const insurance = sum((r) => r.insurance);
  if (insurance && accounts.insurance) out.push({ accountId: accounts.insurance, debit: 0, credit: insurance });
  const net = sum((r) => r.net);
  if (net) out.push({ accountId: accounts.from, debit: 0, credit: net });
  return out;
}
