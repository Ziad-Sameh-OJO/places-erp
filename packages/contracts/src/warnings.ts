import { z } from "zod";
import { WARNING_TRIGGERS, type PlanStatus, type WarningTrigger } from "@places/domain";
import { CalendarDay } from "./common.ts";

/* ---- M-05 · warnings (HR 15 Nov) ---- */
export const WarningRuleInput = z.object({
  id: z.string().trim().min(1).max(40),
  trigger: z.enum(WARNING_TRIGGERS),
  min: z.number().int().min(0, "الرقم 0 أو أكتر (0 = القاعدة مقفولة)").max(31),
  type: z.string().trim().min(2, "اكتب نوع الإنذار").max(120),
});
export const WarningSettings = z.object({
  rules: z.array(WarningRuleInput).max(20).refine((r) => new Set(r.map((x) => x.id)).size === r.length, "كل قاعدة ليها id مختلف"),
  template: z.string().trim().min(10, "اكتب نص الإنذار").max(3000).refine((t) => t.includes("{type}"), "النص لازم يبقى فيه {type} مكان نوع الإنذار"),
});
export type WarningSettings = z.infer<typeof WarningSettings>;

/** HR issues a flagged warning (its type can be reworded) or writes one by hand (employeeId + reason). */
export const IssueWarning = z.object({ type: z.string().trim().min(2, "اكتب نوع الإنذار").max(120) });
export const NewWarning = IssueWarning.extend({ employeeId: z.string().min(1), reason: z.string().trim().min(2, "اكتب السبب").max(300) });
export type NewWarning = z.infer<typeof NewWarning>;
export const WarningsQuery = z.object({ employeeId: z.string().min(1).optional() });

export interface WarningView { id: string; employeeId: string; name: string; month: string; reason: string; type: string; status: "due" | "issued" | "dismissed"; issuedAt: string | null; by: string; hasPdf: boolean }
export interface WarningSettingsView { rules: { id: string; trigger: WarningTrigger; min: number; type: string }[]; template: string }

/* ---- M-05 · the improvement plan ---- */
export const ImprovementThreshold = z.object({ threshold: z.number().int().min(1).max(100) });
export const RequestPlan = z.object({ employeeId: z.string().min(1) });
export const SubmitPlan = z.object({
  goals: z.string().trim().min(2, "اكتب الأهداف").max(2000),
  actions: z.string().trim().min(2, "اكتب الخطوات").max(2000),
  dueDate: CalendarDay,
});
export type SubmitPlan = z.infer<typeof SubmitPlan>;
export const PlanStep = z.object({ step: z.enum(["follow", "close"]), note: z.string().trim().max(1000).optional() });
export type PlanStep = z.infer<typeof PlanStep>;

export interface ImprovementPlanView { id: string; employeeId: string; name: string; month: string; score: number; tl: string; status: PlanStatus; goals: string | null; actions: string | null; dueDate: string | null; note: string | null; canSubmit: boolean; canFollow: boolean }
/** Who's under the threshold this month (the live KPI card score) and their plan, if HR asked already. */
export interface ImprovementCandidate { employeeId: string; name: string; score: number; tl: string | null; planId: string | null; status: PlanStatus | null }
export interface ImprovementView { month: string; threshold: number; candidates: ImprovementCandidate[]; plans: ImprovementPlanView[] }
