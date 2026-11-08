import { BadRequestException } from "@nestjs/common";
import type { EntryView, ManualEntry } from "@places/contracts";

/**
 * M-09 field permissions for the accounts and procurement: a hidden field's value never leaves the API. Their answers
 * are trees (an account's children, an entry's lines, the statement's stages), so the hidden keys are blanked wherever
 * they sit, keeping the kind (text → "", number → 0, yes/no → false; an object under a hidden key → its own values
 * blanked). Lists under a hidden key are walked as usual (the statement's `admin` total and its `lines.admin` rows).
 */
export function blankHidden<T>(value: T, hidden: ReadonlySet<string>): T {
  if (!hidden.size) return value;
  return walk(value, hidden, false) as T;
}

function walk(v: unknown, hidden: ReadonlySet<string>, all: boolean): unknown {
  if (Array.isArray(v)) return v.map((x) => walk(x, hidden, all));
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, hidden, all || (hidden.has(k) && !Array.isArray(x)))]));
  }
  if (!all) return v;
  return typeof v === "string" ? "" : typeof v === "number" ? 0 : typeof v === "boolean" ? false : v;
}

/** Editing a manual entry (9.13): the lines (accounts with their amounts) and the memo the person may not change stay as posted. */
export function keepFixedEntry(input: ManualEntry, before: EntryView, fixed: ReadonlySet<string>): ManualEntry {
  return {
    ...input,
    ...(fixed.has("amount") ? { lines: before.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })) } : {}),
    ...(fixed.has("memo") ? { memo: before.memo } : {}),
  };
}

/** A create that would carry a value the person may not set (an amount on a read-only «المبلغ»). */
export function notYours(label: string): BadRequestException {
  return new BadRequestException(`«${label}» قراية بس عندك · مينفعش تسجّله`);
}
