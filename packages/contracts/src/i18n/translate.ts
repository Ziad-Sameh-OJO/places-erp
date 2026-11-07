/**
 * The words that come from the server — error messages, Zod validation messages, notification texts, the domain's
 * labels and statuses, Excel headers — are written once in Arabic where they're made. Instead of threading a language
 * through every throw and every stored notification, the reader translates them: one catalog of [Arabic, English]
 * pairs, where a {name} stands for a part that changes («الوحدة {code} اتنشرت» ↔ «Unit {code} was published»). Each
 * part is itself looked up, so a status or a label inside a message comes out in English too. Text with no pair stays
 * as it is (names, codes, the client's own words).
 */
export type ServerLocale = "ar" | "en";
export type Pair = readonly [ar: string, en: string];

const exact = new Map<string, string>();
const templates: { re: RegExp; names: string[]; en: string; fixed: number }[] = [];
const memo = new Map<string, string>();
const PART = /\{(\w+)\}/g;
const escape = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&");

export function addPairs(pairs: readonly Pair[]) {
  for (const [ar, en] of pairs) {
    const names: string[] = [];
    const bits = ar.split(/\{(\w+)\}/);
    if (bits.length === 1) { exact.set(ar, en); continue; }
    const re = new RegExp(`^${bits.map((bit, i) => (i % 2 ? (names.push(bit), "([\\s\\S]+?)") : escape(bit))).join("")}$`);
    templates.push({ re, names, en, fixed: bits.filter((_, i) => i % 2 === 0).join("").length });
  }
  // the most specific pattern first (the most fixed text), so «{n} موظف» never catches a longer sentence of its own
  templates.sort((a, b) => b.fixed - a.fixed);
  memo.clear();
}

/** The text in the reader's language: Arabic as it came, English from the catalog (or as it came when it has none). */
export function translate(text: string, locale: ServerLocale): string {
  if (locale === "ar" || !text) return text;
  const hit = exact.get(text) ?? memo.get(text);
  if (hit !== undefined) return hit;
  let out = text;
  for (const t of templates) {
    const m = t.re.exec(text);
    if (!m) continue;
    const parts = Object.fromEntries(t.names.map((n, i) => [n, m[i + 1] ?? ""]));
    out = t.en.replace(PART, (_, n: string) => { const v = parts[n] ?? ""; return exact.get(v) ?? v; });
    break;
  }
  out = out.replace(/(\d) ج\.م/g, "$1 EGP"); // formatEGP's amounts inside any message
  memo.set(text, out);
  return out;
}
