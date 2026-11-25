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
 * 14.13 · Q6 (developer's decision): what a campaign spent within a period of Cairo days. Its spend is spread evenly over
 * the days it ran (start to its end, or today while it still runs — `campaignDays`), and only the days inside the period
 * count — so «النهارده» divides one day's share by today's leads, not the whole spend. No period = all of it. Rounded
 * to the piaster.
 */
export function spentInPeriod(c: { startsOn: string; endsOn: string | null; spent: Piasters }, period: { from?: string | undefined; to?: string | undefined }, today: string): Piasters {
  if (!period.from && !period.to) return c.spent;
  const ran = campaignDays(c, today);
  if (!ran) return 0;
  const last = c.endsOn !== null && c.endsOn < today ? c.endsOn : today;
  const from = period.from && period.from > c.startsOn ? period.from : c.startsOn;
  const to = period.to && period.to < last ? period.to : last;
  const inside = campaignDays({ startsOn: from, endsOn: to }, to);
  return Math.round((c.spent * inside) / ran);
}

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
  return [...m].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)); // ties: a stable order, not the rows' order
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

// ───────── 14.13 · the cost the dashboard shows: per lead, per Qualified or per deal ─────────

/** «الـ Cost تختاره»: CPL, CPQ (Qualified) or Cost per transaction. */
export const COST_METRICS = ["lead", "qualified", "deal"] as const;
export type CostMetric = (typeof COST_METRICS)[number];

/** What a period's spend is divided by, per metric. */
export interface CostCounts { readonly leads: number; readonly qualified: number; readonly deals: number }

/** The chosen cost: spent ÷ leads, Qualified or deals, to the piaster; null when there's nothing to divide by. */
export function costPer(metric: CostMetric, spent: Piasters, n: CostCounts): Piasters | null {
  return costPerLead(spent, metric === "lead" ? n.leads : metric === "qualified" ? n.qualified : n.deals);
}

/** A deal seen from its lead: the Cairo day the lead came in, the lead's campaign, and when the deal closed. */
export interface DealOfLead { readonly leadArrivedOn: string; readonly campaignId: string | null; readonly closedOn: string }

/**
 * 14.13 (management meeting, 15 Nov): a deal counts for the campaign and the period its LEAD came in, not when it closed —
 * a lead from June closed in October lowers June's cost per transaction, not October's (so `closedOn` is ignored on
 * purpose). The deals per campaign (null = none) whose lead came in within the period: Cairo days, both ends included,
 * a missing end is open.
 */
export function dealsByLeadArrival(deals: readonly DealOfLead[], period: { from?: string | undefined; to?: string | undefined }): Map<string | null, number> {
  const n = new Map<string | null, number>();
  for (const d of deals) {
    if ((period.from && d.leadArrivedOn < period.from) || (period.to && d.leadArrivedOn > period.to)) continue;
    n.set(d.campaignId, (n.get(d.campaignId) ?? 0) + 1);
  }
  return n;
}
