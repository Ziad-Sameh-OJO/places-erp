/**
 * M-01 · the bulk entry (1.19): Telesales sends a sheet of mobiles, Operations approves, the numbers that are new go
 * to today's salespeople evenly, in turn (M-01 3.2: «عدد الأرقام ÷ عدد السيلز الموجودين في ترتيب اليوم، وبيمشي بالترتيب»).
 */

/** An Egyptian mobile as the leads keep it: 11 digits starting 010 / 011 / 012 / 015. */
const MOBILE = /^01[0-25]\d{8}$/;

/**
 * The mobiles in whatever was pasted or read from a sheet's cells: one per line, a column copied from Excel, numbers
 * with spaces or dashes, or Excel's numeric cells that lost the leading 0 (1012345678). Each once, in the order met.
 */
export function bulkMobiles(texts: readonly string[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    for (const piece of t.split(/[\n\r,;\t]+/)) {
      let digits = piece.replace(/\D/g, "");
      if (digits.startsWith("20") && digits.length === 12) digits = `0${digits.slice(2)}`; // +20 10…
      if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
      if (MOBILE.test(digits)) out.add(digits);
    }
  }
  return [...out];
}

/**
 * Who gets each number: in turn over the pool in its order, so the first ones get one more when it doesn't divide
 * (10 on 3 → 4 / 3 / 3; 50 on 17 → 16 get 3 and the last one 2). Same counts as distributeEvenly.
 */
export function assignInTurn<T>(items: readonly T[], pool: readonly string[]): Array<{ item: T; to: string }> {
  if (!pool.length) return [];
  return items.map((item, i) => ({ item, to: pool[i % pool.length]! }));
}
