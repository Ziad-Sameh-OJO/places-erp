/**
 * Company names typed by hand (client, 22 Nov): whoever entered a lead may have spelled its company differently —
 * «اعمار» for «إعمار», «شركه» for «شركة», «Emmar» for «Emaar». Three uses:
 * 1. the search finds a company whatever the hamza, the taa marbuta, the case or the spacing (`nameKey`);
 * 2. when nothing matches, the closest names are offered («تقصد: …؟», `similarNames`);
 * 3. adding a company warns of one with a close name, and the same name spelled the other way is the same company.
 *
 * Done here rather than with Postgres' pg_trgm: with the C locale (the local database) pg_trgm drops Arabic letters,
 * so the same search would behave differently on each machine.
 */

/** How close a name must be to be offered (0–1, as pg_trgm's default `similarity_threshold`). */
export const SIMILAR_NAME_MIN = 0.3;
/** At most this many «تقصد» names. */
export const SIMILAR_NAME_MAX = 3;

const DIACRITICS = /[ً-ٰٟـ]/g; // tashkeel, the superscript alef and the tatweel «ـ»
const FOLD: Record<string, string> = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ئ": "ي", "ؤ": "و", "ک": "ك", "ی": "ي" };
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * The name as compared: lower case, Arabic letters folded to one shape (أ إ آ → ا, ة → ه, ى ئ → ي, ؤ → و), no
 * tashkeel, Arabic digits as Latin ones, punctuation as spaces, single spaces.
 */
export function nameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(DIACRITICS, "")
    .replace(/[؀-ۿ]/g, (c) => FOLD[c] ?? (ARABIC_DIGITS.includes(c) ? String(ARABIC_DIGITS.indexOf(c)) : c))
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Two spellings of the same name («إعمار مصر» and «اعمار  مصر»). */
export const sameName = (a: string, b: string) => !!nameKey(a) && nameKey(a) === nameKey(b);

/** The search: `q` is part of `name`, spelled either way and with or without spaces («emaarmisr» finds «Emaar Misr»). */
export function nameContains(name: string, q: string): boolean {
  const needle = nameKey(q).replace(/ /g, "");
  return !!needle && nameKey(name).replace(/ /g, "").includes(needle);
}

/** pg_trgm's trigrams: each word padded with two spaces before and one after, cut in threes. */
function trigrams(key: string): Set<string> {
  const out = new Set<string>();
  for (const w of key.split(" ").filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const g of a) if (b.has(g)) both++;
  return both / (a.size + b.size - both);
}

/**
 * How alike two names are, 0–1: the shared trigrams over all of them (pg_trgm's `similarity`), or, when the search
 * is shorter than the name, against the same number of words in a row inside it — so «Mountin» is close to
 * «Mountain View» although the name has a second word.
 */
export function nameSimilarity(q: string, name: string): number {
  const qk = nameKey(q), nk = nameKey(name);
  if (!qk || !nk) return 0;
  const qg = trigrams(qk);
  let best = jaccard(qg, trigrams(nk));
  const qw = qk.split(" ").length, words = nk.split(" ");
  for (let i = 0; i + qw <= words.length && qw < words.length; i++) best = Math.max(best, jaccard(qg, trigrams(words.slice(i, i + qw).join(" "))));
  return best;
}

/**
 * «تقصد: …؟» — the names closest to `q`, best first, that the search itself doesn't already find (those are in the
 * results), each name once.
 */
export function similarNames(q: string, names: readonly string[], min = SIMILAR_NAME_MIN, max = SIMILAR_NAME_MAX): string[] {
  const seen = new Set<string>();
  return names
    .filter((n) => { const k = nameKey(n); if (!k || seen.has(k) || nameContains(n, q)) return false; seen.add(k); return true; })
    .map((n) => ({ n, s: nameSimilarity(q, n) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s || a.n.localeCompare(b.n))
    .slice(0, max)
    .map((x) => x.n);
}
