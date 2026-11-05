/**
 * M-03 1.1 · 2.3 · 7.1 · Not Active Inventory: sheets Manar uploads (e.g. CFC). Their columns aren't known yet (the
 * client still has to send them), so a sheet keeps whatever headers it came with, and a second upload of the same
 * sheet adds only the rows whose value in the column Manar picks isn't there yet.
 */

/** A row as read from the sheet: header → cell text. */
export type SheetRow = Readonly<Record<string, string>>;

/** Marwa's classification (M-03 1.1): No Answer · Not True (with feedback) · Done (a new unit). */
export const NOT_ACTIVE_STATUSES = ["No Answer", "Not True", "Done"] as const;
export type NotActiveStatus = (typeof NOT_ACTIVE_STATUSES)[number];

const PHONE_LIKE = /^[+\d\s\-()]+$/;

/**
 * The value two rows are compared by: case, spaces and a phone number's formatting don't make a new row
 * (01012345678, +20 101 234 5678 and 0101-234-5678 are the same number). Empty = no value.
 */
export function dedupeKey(value: string | undefined): string {
  const v = (value ?? "").trim().replace(/\s+/g, " ");
  if (!v) return "";
  if (PHONE_LIKE.test(v)) {
    const digits = v.replace(/\D/g, "");
    // an Egyptian number written with the country code is the same number
    return digits.length >= 11 && digits.startsWith("20") ? `0${digits.slice(2)}` : digits;
  }
  return v.toLowerCase();
}

export interface MergeResult {
  readonly added: readonly { readonly key: string; readonly data: SheetRow }[];
  /** already in the sheet, or twice in this file */
  readonly duplicates: number;
  /** no value in the chosen column: nothing to tell it apart by */
  readonly noKey: number;
}

/**
 * M-03 7.1: «منار رفعت شيت CFC تاني فيه 50 صف، منهم 20 رقم وحدة موجود قبل كده ← الـ 30 الجديدين بس يتضافوا».
 * `existing` are the sheet's rows already saved; rows are compared by the chosen column.
 */
export function mergeSheetRows(existing: readonly SheetRow[], incoming: readonly SheetRow[], column: string): MergeResult {
  const seen = new Set(existing.map((r) => dedupeKey(r[column])).filter(Boolean));
  const added: { key: string; data: SheetRow }[] = [];
  let duplicates = 0, noKey = 0;
  for (const data of incoming) {
    const key = dedupeKey(data[column]);
    if (!key) { noKey++; continue; }
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    added.push({ key, data });
  }
  return { added, duplicates, noKey };
}

/** The sheet's columns after a merge: the ones it had, then any new header, in the file's order. */
export const mergeColumns = (had: readonly string[], headers: readonly string[]): string[] => [...new Set([...had, ...headers])];

/** Why a classification can't be saved (Arabic, shown as is), or null. M-03 2.3: Not True without a reason is refused. */
export function classifyProblem(status: string, feedback: string | null | undefined): string | null {
  if (!(NOT_ACTIVE_STATUSES as readonly string[]).includes(status)) return "اختار No Answer أو Not True أو Done";
  if (status === "Not True" && !feedback?.trim()) return "Not True لازم يتكتب جنبه السبب (Feedback)";
  return null;
}

/** A phone number as the sheets and the inventory write it, reduced to compare (0100…, +20 100…, 0100-…); "" if it isn't one. */
export function phoneKey(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.length >= 12 && digits.startsWith("20") ? `0${digits.slice(2)}` : digits;
}

/** The header that holds the owner's number (M-03 1.1: «خانة الـ Number»), when the sheet names it plainly. */
export const guessNumberColumn = (headers: readonly string[]): string | null =>
  headers.find((h) => /^(number|phone|mobile|رقم|الرقم|رقم المالك|رقم التليفون|الموبايل|موبايل)$/i.test(h.trim())) ?? null;

/**
 * M-03 1.1 · 2.3: rows whose number is already an owner's number in the main inventory → that unit (Manar is told and
 * decides the row's status; the row stays in the sheet).
 */
export function inventoryMatches<R extends { id: string; number: string | undefined }, U extends { ownerPhone: string | null }>(rows: readonly R[], units: readonly U[]): Map<string, U> {
  const byPhone = new Map<string, U>();
  for (const u of units) { const k = phoneKey(u.ownerPhone); if (k && !byPhone.has(k)) byPhone.set(k, u); }
  const out = new Map<string, U>();
  for (const r of rows) { const u = byPhone.get(phoneKey(r.number)); if (u) out.set(r.id, u); }
  return out;
}
