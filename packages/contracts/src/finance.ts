import { z } from "zod";
import { CalendarDay, Id, Money, Page } from "./common.ts";

/** M-07 · the chart of accounts (9.1) and the journal (9.5). */

export interface AccountNode {
  id: string; code: string; name: string; nature: "dr" | "cr"; kind: string | null; fixed: boolean;
  /** live balance in the account's direction (a parent = the sum of its children) */
  balance: string;
  /** can it be removed: added later, no movements, no sub-accounts */
  removable: boolean;
  children: AccountNode[];
}
export interface ChartView {
  roots: AccountNode[];
  /** assets = liabilities + equity (the year's result included), shown above the tree */
  check: { assets: string; liabilities: string; equity: string; balanced: boolean };
}

/** «حساب جديد في الشجرة»: under which account, its name, and an optional opening balance with its other side. */
export const NewAccount = z.object({
  parentId: Id,
  name: z.string().trim().min(2, "اكتب اسم الحساب").max(120),
  kind: z.enum(["treasury", "bank", "wallet"]).optional(),
  opening: Money.optional(),
  /** the other side of the opening entry (default: retained earnings 33) */
  counterId: Id.optional(),
  date: CalendarDay.optional(),
});
export type NewAccount = z.infer<typeof NewAccount>;

export interface LedgerLineView { entryId: string; no: string; date: string; nature: string; memo: string; debit: string; credit: string; balance: string }
export interface AccountLedger { account: { id: string; code: string; name: string; path: string[]; nature: "dr" | "cr" }; balance: string; lines: LedgerLineView[] }

export interface EntryLineView { accountId: string; code: string; name: string; path: string[]; debit: string; credit: string }
export interface EntryView { id: string; no: string; date: string; nature: string; source: string; sourceId: string | null; memo: string; by: string; lines: EntryLineView[]; debit: string; credit: string }
export interface JournalView { items: EntryView[]; total: number; page: number; pageSize: number; totals: { debit: string; credit: string; balanced: boolean } }

export const JournalFilters = Page.extend({
  from: CalendarDay.optional(), to: CalendarDay.optional(),
  accountId: Id.optional(),
  q: z.string().trim().max(80).optional(),
});
export type JournalFilters = z.infer<typeof JournalFilters>;

/** Opening balances from the start date (9.5): each account's balance in its own direction; the rest closes to 33. */
export const OpeningBalances = z.object({
  date: CalendarDay,
  lines: z.array(z.object({ accountId: Id, amount: Money })).min(1, "اكتب رصيد حساب واحد على الأقل").max(300),
});
export type OpeningBalances = z.infer<typeof OpeningBalances>;

/* ---- 9.2 · 9.3 · 9.11 · treasury vouchers and the budget ---- */

/** One form for every voucher kind (demo mvNew); the API checks which sides each kind needs. */
export const NewMove = z.object({
  kind: z.enum(["pay", "receive", "transfer", "advance", "custody", "settle"]),
  date: CalendarDay.optional(),
  fromId: Id.optional(),
  toId: Id.optional(),
  /** pay: the expense · receive: the revenue (42…) · settle: the custody account */
  accountId: Id.optional(),
  /** settle: the expense the custody was spent on */
  expenseId: Id.optional(),
  amount: Money.optional(),
  spent: Money.optional(),
  returned: Money.optional(),
  /** advance / custody: the employee (user id) */
  partyId: Id.optional(),
  party: z.string().trim().max(120).optional(),
  ref: z.string().trim().max(60).optional(),
  memo: z.string().trim().min(2, "اكتب البيان").max(200),
  /** paying a recurring bill this month (9.16) */
  billId: Id.optional(),
});
export type NewMove = z.infer<typeof NewMove>;

export interface MoveEffect { code: string; name: string; before: string; after: string }
export interface MoveView {
  id: string; no: string; kind: string; label: string; date: string; amount: string; spent: string | null; returned: string | null;
  from: { id: string; code: string; name: string } | null; to: { id: string; code: string; name: string } | null;
  account: { id: string; code: string; name: string } | null;
  party: string; ref: string | null; memo: string; by: string; entry: { id: string; no: string };
}
/** After saving: the voucher, its entry and «الأثر على شجرة الحسابات» (before → after), plus a budget warning if one was crossed. */
export interface MoveSaved { move: MoveView; effect: MoveEffect[]; budget: string | null }
export const MoveFilters = Page.extend({ accountId: Id.optional(), kind: z.string().max(20).optional() });
export type MoveFilters = z.infer<typeof MoveFilters>;
export interface MovesView { items: MoveView[]; total: number; page: number; pageSize: number }

export interface CashAccount { id: string; code: string; name: string; kind: string; balance: string }
export interface Holder { accountId: string; code: string; userId: string | null; name: string; balance: string }
/** «الخزن والحركات» + «العهد والسلف»: the safes and banks, open custody, advances, and what a form needs. */
export interface CashView {
  accounts: CashAccount[];
  custody: Holder[];
  advances: Holder[];
  today: { count: number; paid: string; received: string };
  /** expense leaves (5…) with what's left of their budget, for «نوع المصروف» */
  expenses: { id: string; code: string; name: string; left: string | null }[];
  revenues: { id: string; code: string; name: string }[];
  people: { userId: string; name: string }[];
}

export const BudgetPatch = z.object({
  budget: Money.optional(),
  period: z.enum(["month", "quarter", "year"]).optional(),
  alert: z.number().int().min(1).max(100).optional(),
  active: z.boolean().optional(),
  ownerId: Id.nullable().optional(),
});
export type BudgetPatch = z.infer<typeof BudgetPatch>;
export interface BudgetRow { accountId: string; code: string; name: string; group: string; budget: string | null; period: string; alert: number; active: boolean; owner: { userId: string; name: string } | null; spent: string; left: string | null; pct: number; level: "ok" | "warn" | "bad" | "" }
export interface BudgetView { rows: BudgetRow[]; totals: { budget: string; spent: string; left: string; alerts: number }; people: { userId: string; name: string }[] }
/** «بند جديد بالبادجت بتاعه» (9.9): opens a sub-account under 52 / 53 with its budget. */
export const NewBudgetLine = z.object({
  parent: z.enum(["52", "53"]),
  name: z.string().trim().min(2, "اكتب اسم البند").max(120),
  budget: Money,
  period: z.enum(["month", "quarter", "year"]).default("month"),
  alert: z.number().int().min(1).max(100).default(80),
  ownerId: Id.optional(),
});
export type NewBudgetLine = z.infer<typeof NewBudgetLine>;

/* ---- 9.16 · recurring bills ---- */
export const NewBill = z.object({
  name: z.string().trim().min(2, "اكتب اسم الفاتورة").max(120),
  vendor: z.string().trim().min(1, "اكتب المورد").max(120),
  accountId: Id,
  fromId: Id,
  amount: Money,
  day: z.number().int().min(1).max(28),
});
export type NewBill = z.infer<typeof NewBill>;
export const SkipBill = z.object({ reason: z.string().trim().min(2, "اكتب السبب").max(200) });
export type SkipBill = z.infer<typeof SkipBill>;
export interface BillView {
  id: string; name: string; vendor: string; amount: string; day: number; active: boolean;
  account: { id: string; code: string; name: string }; from: { id: string; code: string; name: string };
  state: "paid" | "skipped" | "off" | "due" | "soon" | "later"; stateLabel: string; move: { id: string; no: string } | null; reason: string | null;
}
export interface BillsView { month: string; label: string; items: BillView[]; due: number }

/* ---- 9.13 · manual journal entries · 9.8 · periods ---- */
export const ManualEntry = z.object({
  date: CalendarDay,
  memo: z.string().trim().min(2, "اكتب البيان").max(200),
  lines: z.array(z.object({ accountId: Id, debit: Money, credit: Money })).min(2, "القيد محتاج سطرين على الأقل").max(40),
});
export type ManualEntry = z.infer<typeof ManualEntry>;
/** After saving a manual entry: the entry and «الأثر على شجرة الحسابات». */
export interface EntrySaved { entry: EntryView; effect: MoveEffect[] }

export interface PeriodView { month: string; label: string; status: "open" | "month" | "quarter"; statusLabel: string }
export const ClosePeriod = z.object({ kind: z.enum(["month", "quarter"]) });
export type ClosePeriod = z.infer<typeof ClosePeriod>;

/* ---- 9.7 · the income statement ---- */
export const IncomeQuery = z.object({ range: z.enum(["month", "year"]).default("month") });
export type IncomeQuery = z.infer<typeof IncomeQuery>;
export interface StatementLineView { id: string; code: string; name: string; value: string }
export interface IncomeView {
  range: "month" | "year"; label: string; from: string;
  revenue: string; direct: string; gross: string; selling: string; contribution: string; admin: string; other: string; net: string;
  lines: { revenue: StatementLineView[]; direct: StatementLineView[]; selling: StatementLineView[]; admin: StatementLineView[]; other: { head: StatementLineView; lines: StatementLineView[] }[] };
}

/* ---- 9.14 · payroll ---- */
export interface PayrollRowView { userId: string; name: string; line: "admin" | "sales"; salary: string; attendance: string; advanceLeft: string; advance: string; net: string; advanceAccountId: string | null }
export interface PayrollView {
  month: string; label: string; payDay: number; due: boolean;
  run: { id: string; at: string; net: string; gross: string; from: string; move: { id: string; no: string } } | null;
  rows: PayrollRowView[]; totals: { salary: string; attendance: string; advance: string; net: string; people: number };
}
export const PayDay = z.object({ day: z.number().int().min(1).max(28) });
export const AdvancePlan = z.object({ amount: Money });
export const PayrollRunInput = z.object({ fromId: Id, date: CalendarDay.optional() });
export type PayrollRunInput = z.infer<typeof PayrollRunInput>;
