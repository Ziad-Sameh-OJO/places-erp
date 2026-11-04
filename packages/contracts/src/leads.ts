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

/** One row of the leads list: what the table and the Kanban card show, nothing more. */
export interface LeadRow {
  id: string; code: string; name: string; phones: string[]; area: string; type: string; channel: string;
  campaign: { id: string; name: string } | null; stage: string; qualified: boolean; touched: boolean;
  assignedTo: { id: string; name: string } | null; assignedAt: string | null; arrivedAt: string; createdAt: string;
}
