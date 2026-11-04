/**
 * M-13 2.1 · 3.3 · the lists the screens are built on (areas, channels, finishing…). A value used in old records is
 * switched off («موقوف») instead of deleted, so old records and reports keep it; and the values the system posts
 * or calculates on (accountant meeting, 4 Nov: «عمولة من عميل») stay on.
 */
export interface ListValue { readonly value: string; readonly active: boolean }

/** Why a list can't be saved like that (Arabic, shown as is), or null when it can. */
export function listChangeProblem(before: readonly ListValue[], after: readonly ListValue[], locked: readonly string[] = []): string | null {
  const now = new Map(after.map((i) => [i.value, i]));
  const removed = before.find((i) => !now.has(i.value));
  if (removed) return `«${removed.value}» ماتتمسحش · وقّفها بدل ما تشيلها، عشان البيانات القديمة`;
  const off = locked.find((v) => now.get(v)?.active === false || (!now.has(v) && before.some((i) => i.value === v)));
  if (off) return `«${off}» السيستم بيحسب عليها · ماتتوقفش`;
  return null;
}

/** A list saved before values could be switched off (plain text) as the current shape: every value active. */
export const asListValues = (raw: unknown): ListValue[] =>
  Array.isArray(raw) ? raw.map((x) => (typeof x === "string" ? { value: x, active: true } : (x as ListValue))) : [];

/** The values a form may store: the active ones, plus the one the record already has (it may have been switched off since). */
export function allowedValue(items: readonly ListValue[], value: string, current: string | null = null): boolean {
  return value === current || items.some((i) => i.active && i.value === value);
}
