/**
 * Money is always an integer number of piasters (1 EGP = 100 piasters). Never floats for money:
 * 0.1 + 0.2 !== 0.3, and commission splits must add back up to the exact amount collected.
 */
export type Piasters = number;

export const egp = (pounds: number): Piasters => Math.round(pounds * 100);
export const toPounds = (p: Piasters): number => p / 100;

/**
 * Split `total` into `parts` integer shares that always sum back to `total`.
 * The remainder goes one piaster at a time to the first shares (largest-remainder method),
 * so 100.00 split 3 ways is 33.34 + 33.33 + 33.33 — never 99.99.
 */
export function allocate(total: Piasters, parts: number): Piasters[] {
  if (!Number.isInteger(total)) throw new RangeError("allocate: total must be whole piasters");
  if (!Number.isInteger(parts) || parts <= 0) throw new RangeError("allocate: parts must be a positive integer");
  const base = Math.trunc(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < Math.abs(remainder) ? Math.sign(remainder) : 0));
}

/** A percentage of an amount, rounded half-up to the piaster. `percent` is e.g. 30 for 30%. */
export const percentOf = (amount: Piasters, percent: number): Piasters => Math.round((amount * percent) / 100);

export const formatEGP = (p: Piasters): string =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(toPounds(p));
