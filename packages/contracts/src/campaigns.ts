import { z } from "zod";
import { CalendarDay, Money } from "./common.ts";

/**
 * M-04 2.1 step 1 · 3.1: the campaigns screen. Name, channel and the start are required; the rest is optional. 4.20: no end
 * date at creation («مستمرة»: `endsOn` null until it's stopped from «تعديل»), the budget per day, the units from the
 * inventory sheet.
 */
export const CampaignInput = z.object({
  name: z.string().trim().min(2, "اكتب اسم الكامبين").max(120),
  channel: z.string().trim().min(1, "اختار الـ Channel").max(60),
  startsOn: CalendarDay,
  endsOn: CalendarDay.nullable().default(null),
  budget: Money.default("0"), // the total of a campaign from before the per-day budget (kept as is)
  dailyBudget: Money.optional().or(z.literal("").transform(() => undefined)), // 4.20 «الميزانية per day (ج.م)»
  unitIds: z.array(z.string().min(1).max(40)).max(300).default([]), // 4.20 «الوحدات المستهدفة (من شيت الانفنتوري)»
  spent: Money.default("0"), // what it actually cost: Finance and the cost center read it
  target: z.string().trim().max(200).optional(), // «المشروع / الوحدات المستهدفة»
  page: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)), // «Page name» from «أسماء الصفحات» (4.19)
  adUrl: z.string().trim().url("لينك الإعلان مش مظبوط").max(500).optional().or(z.literal("").transform(() => undefined)),
  note: z.string().trim().max(1000).optional(),
}).refine((c) => c.endsOn === null || c.endsOn >= c.startsOn, { message: "النهاية لازم تبقى بعد البداية", path: ["endsOn"] });
export type CampaignInput = z.infer<typeof CampaignInput>;

export interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  startsOn: string;
  /** null = «مستمرة» */
  endsOn: string | null;
  /** what the budget adds up to so far: per day × its days, or a campaign from before's total («الإجمالي المحسوب») */
  budget: string;
  /** «per day», null for a campaign from before */
  dailyBudget: string | null;
  /** its days so far (start → its end or today) */
  days: number;
  spent: string;
  /** the units it targets, from the inventory sheet */
  units: Array<{ id: string; code: string; project: string }>;
  target: string | null;
  page: string | null;
  adUrl: string | null;
  note: string | null;
  /** running today (Cairo) */
  live: boolean;
  leads: number;
  qualified: number;
  /** spent ÷ leads, null without leads */
  costPerLead: string | null;
}

export const CampaignUnitsQuery = z.object({ campaignId: z.string().max(40).optional() });
export type CampaignUnitsQuery = z.infer<typeof CampaignUnitsQuery>;
/** 4.20 · a row of the campaign's unit picker: the available units (and the ones it already has). */
export interface CampaignUnitOption { id: string; code: string; project: string; type: string; area: string; space: number }

/** 4.19 · «أسماء الصفحات»: a name added or renamed (a rename moves its campaigns with it). */
export const PageNameInput = z.object({ name: z.string().trim().min(1, "اكتب اسم الصفحة").max(60) });
export type PageNameInput = z.infer<typeof PageNameInput>;
/** One name of the list and how many campaigns are on it. */
export interface PageNameRow { id: string; name: string; campaigns: number }

/** M-04 3.2 · 6.1: the dashboard's filters — a period of Cairo days (day / week / month / dates), a channel, a campaign. */
const DashboardFilter = z.object({
  from: CalendarDay.optional(),
  to: CalendarDay.optional(),
  channel: z.string().trim().max(60).optional(),
  campaignId: z.string().max(40).optional(),
});
export const DashboardQuery = DashboardFilter.refine((q) => !q.from || !q.to || q.from <= q.to, { message: "«من» لازم تبقى قبل «لحد»", path: ["to"] });
export type DashboardQuery = z.infer<typeof DashboardQuery>;

/** 4.18 · «الليدز اللي ماكانتش Qualified»: the dashboard's filter, and one reason (a stage) to list. */
export const NotQualifiedQuery = DashboardFilter.extend({ reason: z.string().max(40).optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "«من» لازم تبقى قبل «لحد»", path: ["to"] });
export type NotQualifiedQuery = z.infer<typeof NotQualifiedQuery>;

/** One lead that never became Qualified, without the client's private data (no mobile): its reason and the salesperson's last word. */
export interface NotQualifiedRow {
  id: string; code: string; name: string; channel: string; campaign: string | null;
  /** its stage: the action the salesperson took (No Answer, Not Interested, Fresh = nobody called yet, Cancellation, Hold) */
  reason: string;
  /** the latest comment a person wrote on it (else his latest action), who and when; null = nobody touched it */
  comment: { text: string; by: string; at: string } | null;
}
export interface NotQualifiedView {
  /** leads that arrived in the filter, and how many of them never became Qualified */
  total: number;
  notQualified: number;
  byReason: Array<{ reason: string; count: number }>;
  /** the latest first, at most `NOT_QUALIFIED_ROWS`; `matching` = how many the reason filter has */
  rows: NotQualifiedRow[];
  matching: number;
}
export const NOT_QUALIFIED_ROWS = 60;

export interface SourceCountView { leads: number; qualified: number; rate: number | null }
export interface MarketingDashboard {
  total: SourceCountView;
  /** what the campaigns in the filter cost, and per Qualified lead */
  spent: string;
  costPerQualified: string | null;
  campaignCount: number;
  channels: Array<SourceCountView & {
    channel: string;
    noCampaign: number;
    campaigns: Array<SourceCountView & { id: string; name: string; target: string | null; costPerLead: string | null }>;
  }>;
  posts: Array<{ post: string; leads: number }>;
}
