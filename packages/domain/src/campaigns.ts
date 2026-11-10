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

/** One time a lead reached us (every arrival counts, the duplicates too — Q22), with its lead's sticky Qualified mark. */
export interface Arrival { readonly channel: string; readonly campaignId: string | null; readonly qualified: boolean; readonly post: string | null }

export interface SourceCount { leads: number; qualified: number; rate: number | null }
export interface ChannelNode extends SourceCount {
  channel: string;
  campaigns: Array<SourceCount & { campaignId: string }>;
  /** arrivals of this channel with no campaign */
  noCampaign: number;
}

const count = (list: readonly Arrival[]): SourceCount => {
  const qualified = list.filter((a) => a.qualified).length;
  return { leads: list.length, qualified, rate: qualificationRate(qualified, list.length) };
};
const byDesc = <T extends { leads: number }>(a: T, b: T) => b.leads - a.leads;

/**
 * M-04 3.2 · 6.1: the dashboard's two levels — each channel's total (Facebook = 320), and under it each campaign's
 * («X» = 120, «Y» = 200), with Qualified and the rate — most leads first.
 */
export function channelTree(arrivals: readonly Arrival[]): ChannelNode[] {
  const channels = [...new Set(arrivals.map((a) => a.channel))];
  return channels.map((channel) => {
    const mine = arrivals.filter((a) => a.channel === channel);
    const ids = [...new Set(mine.flatMap((a) => (a.campaignId ? [a.campaignId] : [])))];
    return {
      channel, ...count(mine),
      campaigns: ids.map((campaignId) => ({ campaignId, ...count(mine.filter((a) => a.campaignId === campaignId)) })).sort(byDesc),
      noCampaign: mine.filter((a) => !a.campaignId).length,
    };
  }).sort(byDesc);
}

/** M-04 3.1 «البوست اللي جاب الليد»: leads per post, most first (arrivals without a post aren't listed). */
export function leadsByPost(arrivals: readonly Arrival[]): Array<{ post: string; leads: number }> {
  const n = new Map<string, number>();
  for (const a of arrivals) if (a.post) n.set(a.post, (n.get(a.post) ?? 0) + 1);
  return [...n].map(([post, leads]) => ({ post, leads })).sort(byDesc);
}

/** Running on `today` (a Cairo calendar day «YYYY-MM-DD»): the demo's «شغالة» / «خلصت». */
export const isCampaignLive = (c: { startsOn: string; endsOn: string | null }, today: string): boolean =>
  c.startsOn <= today && (c.endsOn === null || today <= c.endsOn);

/**
 * 4.20 · a campaign has no end date when it's made: it runs («مستمرة») until it's stopped from «تعديل». Its days so far:
 * from the start to its end or today, whichever comes first, both days counted (demo marketing.js `campDays`).
 */
export function campaignDays(c: { startsOn: string; endsOn: string | null }, today: string): number {
  const to = c.endsOn !== null && c.endsOn < today ? c.endsOn : today;
  return c.startsOn > to ? 0 : Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${c.startsOn}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * 4.20 · the budget is per day: what it adds up to so far (per day × the days, demo `campCap`), which what was spent is
 * compared with and which any report reads as the campaign's budget. A campaign from before keeps its total.
 */
export function campaignBudget(c: { startsOn: string; endsOn: string | null; dailyBudget: Piasters | null; budget: Piasters }, today: string): Piasters {
  return c.dailyBudget !== null ? c.dailyBudget * campaignDays(c, today) : c.budget;
}

/**
 * 4.19 · «أسماء الصفحات» (demo marketing.js `pageAdd` · `pageRen`): why a new name or a rename can't be saved (Arabic, shown
 * as is), or null. Names are compared trimmed and without case, so «website» isn't a second «Website».
 */
export function pageNameProblem(names: readonly string[], name: string, current: string | null = null): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return "اكتب اسم الصفحة";
  return names.some((x) => x !== current && x.trim().toLowerCase() === n) ? "الاسم ده موجود" : null;
}
