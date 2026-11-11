/**
 * M-04 · Q26 · the Company Profile: marketing uploads a logo on each Done Deal and presses Done; «Update» builds the PDF
 * as marketing's file + «عملاؤنا» pages with every Done logo. Everyone gets the newest version.
 */

/** Logos on one «عملاؤنا» page: 5 × 4 on a landscape brochure, 4 × 5 on a portrait one — each big enough to read on a phone. */
export const LOGOS_PER_PAGE = 20;

export interface ProfileLogo { dealId: string; doneAt: Date | null }

/** The logos on «عملاؤنا»: the Done ones, oldest Done first (a new client goes at the end; the page never reshuffles). */
export function profileLogos<T extends ProfileLogo>(logos: readonly T[]): T[] {
  return logos.filter((l) => l.doneAt).sort((a, b) => a.doneAt!.getTime() - b.doneAt!.getTime() || a.dealId.localeCompare(b.dealId));
}

/** Split into «عملاؤنا» pages; none when there's no logo (the PDF is then marketing's file as it is). */
export function logoPages<T>(logos: readonly T[], perPage = LOGOS_PER_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < logos.length; i += perPage) pages.push(logos.slice(i, i + perPage));
  return pages;
}

/**
 * What an «Update» would change against the newest version: logos Done since (added), Done logos taken back
 * (removed), and whether marketing's file changed. Nothing to change = the button stays off.
 */
export function profileChanges(done: readonly string[], published: { dealIds: readonly string[]; baseFileId: string } | null, baseFileId: string | null) {
  const before = new Set(published?.dealIds ?? []), now = new Set(done);
  const added = done.filter((id) => !before.has(id));
  const removed = (published?.dealIds ?? []).filter((id) => !now.has(id));
  const newBase = !!baseFileId && baseFileId !== published?.baseFileId;
  return { added, removed, newBase, any: !!baseFileId && (added.length > 0 || removed.length > 0 || newBase) };
}
