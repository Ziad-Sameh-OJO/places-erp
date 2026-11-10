/**
 * 2.38 · the inventory's Excel import: the uploader picks the column(s) a repeat is told by (demo inventory.js IM_COLS).
 * A row is a repeat only when ALL the chosen columns match a unit already in the inventory or an earlier row of the same
 * file. The default is the unit itself (Project + Area + Floor + Building Number), not the owner's number: one owner
 * often has several units.
 */
import { normalizePhone } from "./clients.ts";

/** The columns one can pick, in the sheet's words (the client's Rent sheet: «Area» is the m², «Contact» the owner's name). */
export const UNIT_DUP_COLUMNS = ["project", "space", "floor", "building", "ownerName", "ownerPhone"] as const;
export type UnitDupColumn = (typeof UNIT_DUP_COLUMNS)[number];
export const UNIT_DUP_DEFAULT: readonly UnitDupColumn[] = ["project", "space", "floor", "building"];

export type UnitDupFields = { readonly [K in UnitDupColumn]?: string | number | null };

/** One column's value as compared: numbers by their digits only, a space by its number, text without extra spaces or case. "" = empty. */
export function dupValue(column: UnitDupColumn, v: string | number | null | undefined): string {
  const t = String(v ?? "").trim();
  if (!t) return "";
  if (column === "ownerPhone") return normalizePhone(t) ?? t.replace(/\D/g, "");
  if (column === "space") return Number(t) ? String(Number(t)) : t;
  return t.toLowerCase().replace(/\s+/g, " ");
}

/** The row's key under the chosen columns; "" when one of them is empty (nothing to tell it apart by, so never a repeat). */
export function dupKey(row: UnitDupFields, columns: readonly UnitDupColumn[]): string {
  const parts = columns.map((c) => dupValue(c, row[c]));
  return parts.length && parts.every(Boolean) ? parts.join("\u0001") : "";
}

/** What a row repeats: a unit (its code) or an earlier line of the file; null = new. */
export type DupOf = { readonly unit: string } | { readonly line: number } | null;

/**
 * Each row's repeat, in order. A unit in the inventory wins over an earlier row; the first row with a key is the one the
 * later rows of the file are matched to.
 */
export function findDuplicates(
  rows: readonly (UnitDupFields & { readonly line: number })[],
  units: readonly (UnitDupFields & { readonly code: string })[],
  columns: readonly UnitDupColumn[],
): DupOf[] {
  const inInventory = new Map<string, string>();
  for (const u of units) { const k = dupKey(u, columns); if (k && !inInventory.has(k)) inInventory.set(k, u.code); }
  const inFile = new Map<string, number>();
  return rows.map((r) => {
    const k = dupKey(r, columns);
    if (!k) return null;
    const unit = inInventory.get(k), line = inFile.get(k);
    if (line === undefined) inFile.set(k, r.line);
    return unit ? { unit } : line !== undefined ? { line } : null;
  });
}

/** The reviewer's call on a row (demo importReview): leave it out · merge into the unit it repeats · add it anyway. */
export const IMPORT_DECISIONS = ["skip", "merge", "add"] as const;
export type ImportDecision = (typeof IMPORT_DECISIONS)[number];

/** A new row is added; a repeat is left out unless the reviewer said otherwise. «merge» only for a repeat of a unit. */
export function importDecision(dup: DupOf, asked: ImportDecision | undefined): ImportDecision {
  if (!dup) return "add";
  if (asked === "merge") return "unit" in dup ? "merge" : "skip";
  return asked ?? "skip";
}
