import { z } from "zod";
import { CalendarDay, Money } from "./common.ts";

/** M-04 2.1 step 1 · 3.1: the campaigns screen. Name, channel and the period are required; the rest is optional. */
export const CampaignInput = z.object({
  name: z.string().trim().min(2, "اكتب اسم الكامبين").max(120),
  channel: z.string().trim().min(1, "اختار الـ Channel").max(60),
  startsOn: CalendarDay,
  endsOn: CalendarDay,
  budget: Money.default("0"), // «الميزانية» (not required)
  spent: Money.default("0"), // what it actually cost: Finance and the cost center read it
  target: z.string().trim().max(200).optional(), // «المشروع / الوحدات المستهدفة»
  adUrl: z.string().trim().url("لينك الإعلان مش مظبوط").max(500).optional().or(z.literal("").transform(() => undefined)),
  note: z.string().trim().max(1000).optional(),
}).refine((c) => c.endsOn >= c.startsOn, { message: "النهاية لازم تبقى بعد البداية", path: ["endsOn"] });
export type CampaignInput = z.infer<typeof CampaignInput>;

export interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  startsOn: string;
  endsOn: string;
  budget: string;
  spent: string;
  target: string | null;
  adUrl: string | null;
  note: string | null;
  /** running today (Cairo) */
  live: boolean;
  leads: number;
  qualified: number;
  /** spent ÷ leads, null without leads */
  costPerLead: string | null;
}

/** M-04 3.2 · 6.1: the dashboard's filters — a period of Cairo days (day / week / month / dates), a channel, a campaign. */
export const DashboardQuery = z.object({
  from: CalendarDay.optional(),
  to: CalendarDay.optional(),
  channel: z.string().trim().max(60).optional(),
  campaignId: z.string().max(40).optional(),
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: "«من» لازم تبقى قبل «لحد»", path: ["to"] });
export type DashboardQuery = z.infer<typeof DashboardQuery>;

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
