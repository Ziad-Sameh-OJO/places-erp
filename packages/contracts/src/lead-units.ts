import { z } from "zod";
import type { JourneyStage } from "@places/domain";
import { Id } from "./common.ts";
import { MAX_LIST_UNITS } from "./inventory.ts";

/** One unit of a step in the log; its page in the inventory opens from it (14.8). */
export interface JourneyUnit { id: string; code: string; project: string }
/**
 * One dated step of the lead's units log (14.8): a List of options, a Short list, or a Visit / Meeting (with its
 * outcome and the spaces typed by hand).
 */
export interface JourneyEntry {
  id: string; stage: JourneyStage; at: string; by: string | null; units: JourneyUnit[];
  extra: string | null; outcome: "done" | "not_done" | null;
}
export interface UnitJourney { stages: { stage: JourneyStage; steps: JourneyEntry[] }[] }

/** 14.11 · «احفظ كترشيح»: the units picked by hand from the inventory, kept on the lead as its Short list. */
export const ShortlistInput = z.object({
  unitIds: z.array(Id, { required_error: "اختار الوحدات" }).min(1, "اختار الوحدات").max(MAX_LIST_UNITS, `لحد ${MAX_LIST_UNITS} وحدة`)
    .transform((u) => [...new Set(u)]),
});
export type ShortlistInput = z.infer<typeof ShortlistInput>;

