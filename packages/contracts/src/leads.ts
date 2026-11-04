import { z } from "zod";
import { LEAD_STAGES } from "@places/domain";
import { CalendarDay, EgyptianMobile, Id, Money, Page } from "./common.ts";

export const CreateLead = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional(),
  phones: z.array(EgyptianMobile).min(1).max(5),
  area: z.string().min(1),
  type: z.enum(["Rent", "Resale", "Primary", "Income"]),
  space: z.number().int().positive().optional(),
  condition: z.string().optional(),
  budget: Money.optional(),
  channel: z.string().min(1),
  campaignId: Id.optional(),
  assignToId: Id.optional(), // Operations choosing a salesperson by hand (uses up their turn)
  keep: z.boolean().optional(), // Telesales: «يفضل عندي (بكلّمه أنا)» instead of «التوزيع (حسب الـ area)»
  note: z.string().max(2000).optional(),
});
export type CreateLead = z.infer<typeof CreateLead>;

export const ChangeStage = z.object({ stage: z.enum(LEAD_STAGES), note: z.string().max(2000).optional() });
export type ChangeStage = z.infer<typeof ChangeStage>;

/** Query strings are text: "false" must mean false (z.coerce.boolean() would read any non-empty text as true). */
const QueryBool = z.enum(["true", "false"]).transform((v) => v === "true");

/** The leads list (M-01): filters of the demo's toolbar + search by name, mobile or code. */
export const LeadFilters = Page.extend({
  q: z.string().trim().max(80).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  area: z.string().optional(),
  channel: z.string().optional(),
  campaignId: Id.optional(),
  assignedToId: Id.optional(),
  qualified: QueryBool.optional(),
  from: CalendarDay.optional(), // Cairo days, both ends included
  to: CalendarDay.optional(),
}).refine((f) => !f.from || !f.to || f.from <= f.to, { path: ["to"], message: "«لحد» قبل «من»" });
export type LeadFilters = z.infer<typeof LeadFilters>;

/** The new-lead form checks the mobiles while they're typed (demo «الرقم ده موجود قبل كده»). */
export const DuplicateCheck = z.object({ phones: z.string().max(200).transform((s) => s.split(",").map((p) => p.replace(/\D/g, "")).filter((p) => /^01[0-25]\d{8}$/.test(p))) });
export type DuplicateCheck = z.infer<typeof DuplicateCheck>;
/** The existing lead's code; its id only when the person may open it (M-01 Q7: only Operations sees both clients). */
export interface DuplicateHit { code: string; leadId: string | null }
export interface DuplicateCheckResult { hit: DuplicateHit | null }

/** What a new lead answers: its code and who it went to («الليد راح لـ …»). */
export interface CreatedLead { id: string; code: string; ownedByTelesales: boolean; assignedTo: { id: string; name: string } | null }

/** A comment or a call result written on the lead's Activity tab (demo: «اكتب كومنت أو نتيجة مكالمة»). */
export const AddComment = z.object({ text: z.string().trim().min(1, "اكتب الكومنت").max(2000, "الكومنت طويل · 2000 حرف بالكتير") });
export type AddComment = z.infer<typeof AddComment>;

/** One row of the leads list: what the table and the Kanban card show, nothing more. */
export interface LeadRow {
  id: string; code: string; name: string; phones: string[]; area: string; type: string; space: number | null; budget: string | null; channel: string;
  campaign: { id: string; name: string } | null; stage: string; qualified: boolean; touched: boolean;
  ownedByTelesales: boolean; // demo: «مع Telesales» — she keeps it to call herself, no SLA
  /** the SLA clock while the lead is Fresh and untouched (null otherwise): level, minutes left, % of the way to the pull */
  sla: { level: "ok" | "warn" | "pull"; minutesLeft: number; pct: number } | null;
  assignedTo: { id: string; name: string } | null; assignedAt: string | null; arrivedAt: string; createdAt: string;
}

/** One line of the lead's Activity: what happened, who did it (null = the system) and when. */
export interface LeadActivityRow {
  id: string; kind: string; text: string; by: { id: string; name: string } | null; at: string;
}

/** The lead drawer (M-01): the list row plus the details and the Activity, newest first. */
export interface LeadDetail extends LeadRow {
  company: string | null; condition: string | null; note: string | null;
  post: string | null; // the campaign post it came from (demo «البوست اللي جابه»)
  noAnswerCount: number; rotation: number; firstActionAt: string | null; activities: LeadActivityRow[];
}

/** Operations' decision on a duplicate: per field, «old» (default) keeps what the lead has, «new» takes the entry's. */
const Side = z.enum(["old", "new"]).default("old");
export const DuplicateDecision = z.object({ name: Side, area: Side, type: Side, space: Side, budget: Side, channel: Side });
export type DuplicateDecision = z.infer<typeof DuplicateDecision>;

/** One side of the comparison table. */
export interface LeadSide {
  name: string; company: string | null; phones: string[]; area: string; type: string; space: number | null; budget: string | null;
  channel: string; campaign: { id: string; name: string } | null;
}
/** A duplicate waiting for Operations: who entered it, when, and both sides. */
export interface DuplicateRow {
  id: string; at: string; by: { id: string; name: string };
  lead: LeadSide & { id: string; code: string; assignedTo: { id: string; name: string } | null };
  entry: LeadSide;
}

/** The KPI tiles and the saved views' counts, over the caller's whole scope (not the current filters). */
export interface LeadSummary {
  total: number; fresh: number; qualified: number; noAnswer: number; interested: number;
  /** leads that came in the last 7 days and the 7 before, for «مقارنة بالأسبوع اللي فات» */
  thisWeek: number; lastWeek: number;
  /** an official holiday today: the SLA runs on wall-clock hours (the note under the list says so) */
  holidayMode: boolean; slaRules: { warnAfter: number; pullAfter: number; holidayWarnAfter: number; holidayPullAfter: number };
}

/** The Kanban: every stage with its real count under the filters, and its newest cards (the demo shows 30 per lane). */
export interface LeadBoard { lanes: { stage: string; total: number; items: LeadRow[] }[] }

/** The filters' choices that aren't settings lists: campaigns, and the salespeople inside the caller's scope. */
export interface LeadOptions {
  campaigns: { id: string; name: string; channel: string }[];
  salespeople: { id: string; name: string }[];
}
