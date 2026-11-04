/**
 * M-07 · the general ledger: the chart of accounts and double-entry journal entries.
 * Accountant's meeting (4 Nov): every movement posts one balanced entry; the five roots are fixed; a parent's balance
 * is the sum of its children; a new sub-account's code comes from its parent's code.
 */
import type { Piasters } from "./money.ts";

export type Nature = "dr" | "cr";

/** The five roots of the chart (M-07, 4 Nov): fixed, never added or removed. */
export const ROOT_ACCOUNTS = [
  { code: "1", name: "الأصول", nature: "dr" },
  { code: "2", name: "الخصوم", nature: "cr" },
  { code: "3", name: "حقوق الملكية", nature: "cr" },
  { code: "4", name: "الإيرادات", nature: "cr" },
  { code: "5", name: "المصروفات", nature: "dr" },
] as const satisfies readonly { code: string; name: string; nature: Nature }[];

/** Retained earnings and the year's result in the accountant's chart (33, 34): the system keeps them, nobody posts under them. */
export const RETAINED_EARNINGS = "33";
export const YEAR_RESULT = "34";

/** An account's nature follows its root: assets and expenses are debit, the rest credit. */
export function natureOf(code: string): Nature {
  const root = ROOT_ACCOUNTS.find((r) => r.code === code[0]);
  if (!root) throw new RangeError(`no root for account code ${code}`);
  return root.nature;
}

/** A balance in the account's own direction: debit-natured = debit − credit, credit-natured = credit − debit. */
export const balanceOf = (nature: Nature, debit: Piasters, credit: Piasters): Piasters => (nature === "dr" ? debit - credit : credit - debit);

/**
 * The code of a new sub-account (M-07, 4 Nov: «الكود بيتعمل لوحده من كود الأب»): the parent's code plus the next
 * two-digit number after its children's (2203 after 2201 and 2202), as the accountant's own sheet numbers sub-lines.
 */
export function nextChildCode(parentCode: string, childCodes: readonly string[]): string {
  const used = childCodes.filter((c) => c.startsWith(parentCode) && c.length === parentCode.length + 2).map((c) => Number(c.slice(parentCode.length)));
  const next = used.length ? Math.max(...used) + 1 : 1;
  if (next > 99) throw new RangeError(`account ${parentCode} already has 99 sub-accounts`);
  return parentCode + String(next).padStart(2, "0");
}

export interface EntryLine {
  readonly accountId: string;
  readonly debit: Piasters;
  readonly credit: Piasters;
}

/**
 * Why an entry can't be posted, or null when it can (M-07 · 9.5 / 9.13): at least two lines, each line either a debit
 * or a credit (whole piasters, not both, not zero), and total debit = total credit.
 */
export function entryProblem(lines: readonly EntryLine[]): string | null {
  if (lines.length < 2) return "القيد محتاج سطرين على الأقل";
  for (const l of lines) {
    if (!Number.isInteger(l.debit) || !Number.isInteger(l.credit) || l.debit < 0 || l.credit < 0) return "المبالغ لازم تبقى موجبة";
    if ((l.debit > 0) === (l.credit > 0)) return "كل سطر يا مدين يا دائن (مش الاتنين ولا صفر)";
  }
  const { debit, credit } = entryTotals(lines);
  return debit === credit ? null : "القيد مش متوازن: المدين لازم يساوي الدائن";
}

export function entryTotals(lines: readonly EntryLine[]): { debit: Piasters; credit: Piasters } {
  return lines.reduce((t, l) => ({ debit: t.debit + l.debit, credit: t.credit + l.credit }), { debit: 0, credit: 0 });
}

/**
 * Live balances for the whole tree: each account's own movements in its direction, and every parent = the sum of its
 * children (M-07, 4 Nov). `own` holds each account's total debit and credit.
 */
export function rollUp(
  accounts: readonly { id: string; parentId: string | null; nature: Nature }[],
  own: ReadonlyMap<string, { debit: Piasters; credit: Piasters }>,
): Map<string, Piasters> {
  const kids = new Map<string, string[]>();
  for (const a of accounts) if (a.parentId) kids.set(a.parentId, [...(kids.get(a.parentId) ?? []), a.id]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out = new Map<string, Piasters>();
  const visit = (id: string): Piasters => {
    const a = byId.get(id)!;
    const children = kids.get(id) ?? [];
    const m = own.get(id) ?? { debit: 0, credit: 0 };
    // a parent can still carry movements of its own (an account that later got sub-accounts): they count too
    const total = balanceOf(a.nature, m.debit, m.credit) + children.reduce((s, c) => s + signedFor(a.nature, byId.get(c)!.nature, visit(c)), 0);
    out.set(id, total);
    return total;
  };
  for (const a of accounts) if (!a.parentId) visit(a.id);
  return out;
}

/** A child of the other nature under a parent (a contra account) counts against it. */
const signedFor = (parent: Nature, child: Nature, amount: Piasters): Piasters => (parent === child ? amount : -amount);

/**
 * The opening balances (9.5): one entry from a start date, each account in its own direction, and the difference
 * closes against retained earnings so the entry balances.
 */
export function openingLines(
  rows: readonly { accountId: string; nature: Nature; amount: Piasters }[],
  retainedEarningsId: string,
): EntryLine[] {
  const lines: EntryLine[] = rows.filter((r) => r.amount !== 0).map((r) => {
    const debitSide = (r.nature === "dr") === (r.amount > 0);
    const a = Math.abs(r.amount);
    return { accountId: r.accountId, debit: debitSide ? a : 0, credit: debitSide ? 0 : a };
  });
  const { debit, credit } = entryTotals(lines);
  if (debit !== credit) lines.push({ accountId: retainedEarningsId, debit: debit < credit ? credit - debit : 0, credit: debit > credit ? debit - credit : 0 });
  return lines;
}

/* ---- periods (M-07 9.8; the accountant's meeting, 4 Nov) ---- */
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
/** «2026-11» for a Cairo day «2026-11-04». */
export const monthOf = (day: string): string => day.slice(0, 7);
export const monthLabel = (month: string): string => `${AR_MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
export type PeriodStatus = "open" | "month" | "quarter";
export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = { open: "مفتوح", month: "مقفول شهرياً", quarter: "مقفول ربع سنوي" };

/**
 * A month's status: the open month follows today (a new month opens by itself and the one before closes monthly);
 * the accountant can close the current month (or the quarter) early. `closed` = the months closed by hand.
 */
export function periodStatus(month: string, today: string, closed: ReadonlyMap<string, PeriodStatus>): PeriodStatus {
  const byHand = closed.get(month);
  if (byHand && byHand !== "open") return byHand;
  return month < monthOf(today) ? "month" : "open";
}

/** Why nothing can post on this day, or null. Opening balances sit on the start date and are exempt. */
export function closedProblem(day: string, today: string, closed: ReadonlyMap<string, PeriodStatus>): string | null {
  return periodStatus(monthOf(day), today, closed) === "open" ? null : `شهر ${monthLabel(monthOf(day))} مقفول · مينفعش تسجّل حركة فيه`;
}
