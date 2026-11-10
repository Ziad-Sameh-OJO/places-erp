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
export const isCampaignLive = (c: { startsOn: string; endsOn: string }, today: string): boolean => c.startsOn <= today && today <= c.endsOn;

// ───────── 4.18 · the leads that never became Qualified, and why ─────────

/** One thing that happened on a lead (sales.LeadActivity): `byUserId` null = the system. */
export interface LeadAct { readonly kind: string; readonly text: string; readonly byUserId: string | null; readonly at: Date }

/**
 * M-04 · «الليدز اللي ماكانتش Qualified»: the reason is what the salesperson did on the lead (its stage) plus his latest
 * comment and who wrote it (demo marketing.js `lastAct`): the latest comment a person wrote, else the latest thing a person
 * did on it (a call, a stage change…); null when nobody touched it yet.
 */
export function lastSalesAct<T extends LeadAct>(acts: readonly T[]): T | null {
  const byPerson = acts.filter((a) => a.byUserId).sort((a, b) => b.at.getTime() - a.at.getTime());
  return byPerson.find((a) => a.kind === "comment") ?? byPerson[0] ?? null;
}

/** How many leads per reason (stage), most first; ties keep the first seen. */
export function countByReason(stages: readonly string[]): Array<{ reason: string; count: number }> {
  const m = new Map<string, number>();
  for (const s of stages) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}
