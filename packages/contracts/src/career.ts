import { z } from "zod";
import { CalendarDay } from "./common.ts";

/* M-05 · «المسار الوظيفي» (HR, 15 Nov): the tracks HR defines, each employee's level and who is due a promotion. */

const pct = z.number().int().min(0).max(1000);
/** One level; the rule (to reach it from the level before) is ignored on the first level. `id` = an existing level. */
export const CareerLevelInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "اسم المستوى مطلوب").max(60),
  quarters: z.number().int().min(1).max(8).default(2),
  minKpi: pct.default(85),
  minTarget: pct.default(100),
  minMonths: z.number().int().min(1).max(120).nullable().default(null),
});
export type CareerLevelInput = z.infer<typeof CareerLevelInput>;
export const CareerTrackInput = z.object({
  name: z.string().trim().min(1, "اسم المسار مطلوب").max(60),
  levels: z.array(CareerLevelInput).min(2, "المسار محتاج مستويين على الأقل").max(12),
});
export type CareerTrackInput = z.infer<typeof CareerTrackInput>;

/** HR sets the level (`set`) or records a promotion (`promotion`) — both kept in the person's history. */
export const CareerMoveInput = z.object({
  employeeId: z.string().min(1),
  levelId: z.string().min(1),
  day: CalendarDay,
  kind: z.enum(["set", "promotion"]),
  note: z.string().trim().max(500).optional(),
});
export type CareerMoveInput = z.infer<typeof CareerMoveInput>;

export interface CareerRuleView { quarters: number; minKpi: number; minTarget: number; minMonths: number | null }
export interface CareerLevelView { id: string; name: string; position: number; /** null on the first level */ rule: CareerRuleView | null }
export interface CareerTrackView { id: string; name: string; sample: boolean; levels: CareerLevelView[] }

export interface CareerQuarterView { quarter: string; kpi: number | null; kpiOk: boolean; /** null = «مالوش تارجت» */ target: number | null; targetOk: boolean | null }
export interface CareerMoveView { id: string; level: string; track: string; day: string; kind: "set" | "promotion"; note: string | null; by: string }
export interface CareerRowView {
  employeeId: string; name: string; jobTitle: string;
  trackId: string | null; level: { id: string; name: string; since: string } | null; next: { id: string; name: string } | null;
  /** «noLevel» = HR hasn't set one · «top» = the last level of the track */
  status: "due" | "near" | "notYet" | "noLevel" | "top";
  rule: CareerRuleView | null; monthsInLevel: number | null;
  check: { kpi: boolean; target: boolean | null; months: boolean | null; streak: number; quarters: CareerQuarterView[] } | null;
  history: CareerMoveView[];
}
export interface CareerView { tracks: CareerTrackView[]; rows: CareerRowView[]; /** the latest closed quarter the check reads */ lastClosed: string | null; canEdit: boolean }
