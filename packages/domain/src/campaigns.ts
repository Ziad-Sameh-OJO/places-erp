/**
 * M-04 · campaigns: the numbers the campaigns screen and the dashboard show per campaign (M-04 3.2): leads,
 * Qualified, the qualification rate and what one lead cost. Every arrival counts, duplicates too (Q22).
 */
import type { Piasters } from "./money.ts";

/** «نسبة التأهيل = Qualified ÷ Total × 100» (M-04 3.2), one decimal; null with no leads. */
export const qualificationRate = (qualified: number, total: number): number | null =>
  total ? Math.round((qualified / total) * 1000) / 10 : null;

/** What one lead cost: spent ÷ leads, to the piaster (rounded half up); null with no leads. */
export const costPerLead = (spent: Piasters, leads: number): Piasters | null => (leads ? Math.round(spent / leads) : null);

/** Running on `today` (a Cairo calendar day «YYYY-MM-DD»): the demo's «شغالة» / «خلصت». */
export const isCampaignLive = (c: { startsOn: string; endsOn: string }, today: string): boolean => c.startsOn <= today && today <= c.endsOn;
