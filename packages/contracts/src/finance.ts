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
