/**
 * Sorting a table by a column's shown text (0.15 · demo shell.js sortTable): numbers and dates by value, not as text.
 * A cell reads «120,000 ج.م», «1.25M», «35%», «٤ نوفمبر», «4 Nov 2025», «من 3 يوم» or a name / code.
 */
export type SortDir = "asc" | "desc";
type Key = { n: number } | { s: string } | null;

const AR_DIGITS = /[٠-٩۰-۹]/g;
const latin = (t: string) => t.replace(AR_DIGITS, (d) => String((d.charCodeAt(0) - (d >= "۰" ? 0x6f0 : 0x660)))).replace(/٫/g, ".").replace(/٬/g, ",");

const MONTHS: Record<string, number> = {
  يناير: 0, فبراير: 1, مارس: 2, أبريل: 3, ابريل: 3, مايو: 4, يونيو: 5, يوليو: 6, أغسطس: 7, اغسطس: 7, سبتمبر: 8, أكتوبر: 9, اكتوبر: 9, نوفمبر: 10, ديسمبر: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
const AGO_UNIT: Record<string, number> = { د: 1, س: 60, يوم: 1440, m: 1, h: 60, d: 1440 };

/** What a cell's text sorts by; null = empty («—»), always last. `now` gives the year a short date leaves out and «من 3 يوم». */
export function cellSortKey(text: string, now: Date): Key {
  const t = latin(text).replace(/\s+/g, " ").trim();
  if (!t || /^[—–-]$/.test(t)) return null;
  if (/^(دلوقتي|just now)$/i.test(t)) return { n: now.getTime() };
  const ago = /^(?:من (\d+) (د|س|يوم)|(\d+)(m|h|d) ago)$/.exec(t);
  if (ago) return { n: now.getTime() - Number(ago[1] ?? ago[3]) * AGO_UNIT[ago[2] ?? ago[4]!]! * 60_000 };
  const date = /^(\d{1,2}) ([^\s\d,]+),?(?: (\d{4}))?(?: (\d{1,2}):(\d{2}) ?(ص|م|am|pm)?)?$/i.exec(t);
  const month = date ? MONTHS[date[2]!.replace(/\.$/, "").toLowerCase()] : undefined;
  if (date && month != null) {
    let h = Number(date[4] ?? 0);
    if (/^(م|pm)$/i.test(date[6] ?? "") && h < 12) h += 12;
    if (/^(ص|am)$/i.test(date[6] ?? "") && h === 12) h = 0;
    return { n: Date.UTC(Number(date[3] ?? now.getUTCFullYear()), month, Number(date[1]), h, Number(date[5] ?? 0)) };
  }
  const n = /^([-+]?[\d,]*\.?\d+) ?([KM])? ?(ج\.م|EGP|%|م²|m²|م|sqm)?$/i.exec(t);
  if (n && /\d/.test(n[1]!)) return { n: Number(n[1]!.replace(/,/g, "")) * (n[2] ? (n[2].toUpperCase() === "M" ? 1e6 : 1e3) : 1) };
  return { s: t };
}

const collator = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });

/** asc: small → big, old → new, ا → ي; numbers before text; empty cells last either way. */
export function compareCells(a: Key, b: Key, dir: SortDir): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  const r = "n" in a && "n" in b ? a.n - b.n : "n" in a ? -1 : "n" in b ? 1 : collator.compare(a.s, b.s);
  return dir === "asc" ? r : -r;
}

/** The rows' order (their indexes) sorted by one column's texts; equal cells keep their order. */
export function sortOrder(texts: string[], dir: SortDir, now: Date): number[] {
  const keys = texts.map((t) => cellSortKey(t, now));
  return texts.map((_, i) => i).sort((x, y) => compareCells(keys[x] ?? null, keys[y] ?? null, dir) || x - y);
}

/** A header click: a new column sorts ascending, the same one flips (the issue: «دوسة تصاعدي، والتانية تنازلي»). */
export const nextSort = <C>(cur: { col: C; dir: SortDir } | null | undefined, col: C): { col: C; dir: SortDir } =>
  ({ col, dir: cur?.col === col && cur.dir === "asc" ? "desc" : "asc" });
