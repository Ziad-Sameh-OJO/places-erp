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

/** A comment or a call result written on the lead's Activity tab (demo: «اكتب كومنت أو نتيجة مكالمة»). */
export const AddComment = z.object({ text: z.string().trim().min(1, "اكتب الكومنت").max(2000) });
export type AddComment = z.infer<typeof AddComment>;

/** One row of the leads list: what the table and the Kanban card show, nothing more. */
export interface LeadRow {
  id: string; code: string; name: string; phones: string[]; area: string; type: string; channel: string;
  campaign: { id: string; name: string } | null; stage: string; qualified: boolean; touched: boolean;
  ownedByTelesales: boolean; // demo: «مع Telesales» — she keeps it to call herself, no SLA
  assignedTo: { id: string; name: string } | null; assignedAt: string | null; arrivedAt: string; createdAt: string;
}

/** One line of the lead's Activity: what happened, who did it (null = the system) and when. */
export interface LeadActivityRow {
  id: string; kind: string; text: string; by: { id: string; name: string } | null; at: string;
}

/** The lead drawer (M-01): the list row plus the details and the Activity, newest first. */
export interface LeadDetail extends LeadRow {
  company: string | null; space: number | null; condition: string | null; budget: string | null; note: string | null;
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
