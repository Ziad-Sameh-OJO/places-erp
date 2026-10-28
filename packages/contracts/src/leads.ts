import { z } from "zod";
import { LEAD_STAGES } from "@places/domain";
import { EgyptianMobile, Id, Money, Page } from "./common.ts";

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

export const LeadFilters = Page.extend({
  q: z.string().max(80).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  area: z.string().optional(),
  channel: z.string().optional(),
  campaignId: Id.optional(),
  assignedToId: Id.optional(),
  qualified: z.coerce.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type LeadFilters = z.infer<typeof LeadFilters>;
