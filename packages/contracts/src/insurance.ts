import { z } from "zod";
import { CalendarDay, Id, Money } from "./common.ts";

/**
 * M-05 · «التأمينات» (HR, 15 Nov): HR records each employee's insurance; Finance sees it; payroll deducts the monthly
 * amount (9.14). The amount is a fixed EGP figure per month until the client says otherwise (open question: % of salary).
 */
const Amount = Money.refine((v) => !v.startsWith("-"), "المبلغ مايبقاش بالسالب");
export const InsuranceInput = z.object({
  insured: z.boolean(),
  since: CalendarDay.nullable().default(null),
  provider: z.string().trim().max(80, "اسم الجهة طويل").default(""),
  monthly: Amount.default("0"),
  companyShare: Amount.nullable().default(null),
  note: z.string().trim().max(500, "الملاحظة طويلة").nullable().default(null),
  /** new uploads to attach (system.File ids); the ones already attached stay */
  files: z.array(Id).max(20, "كفاية 20 ملف في المرة").default([]),
}).superRefine((v, ctx) => {
  if (!v.insured) return;
  if (!v.provider) ctx.addIssue({ code: "custom", path: ["provider"], message: "اكتب جهة التأمين" });
  if (!v.since) ctx.addIssue({ code: "custom", path: ["since"], message: "اكتب متأمن عليه من إمتى" });
});
export type InsuranceInput = z.input<typeof InsuranceInput>;
export type InsuranceSave = z.output<typeof InsuranceInput>;
export const InsuranceFilters = z.object({ insured: z.enum(["yes", "no"]).optional() });
export type InsuranceFilters = z.infer<typeof InsuranceFilters>;

export interface InsuranceRow {
  userId: string; name: string; department: string; jobTitle: string;
  /** recorded false = HR hasn't recorded anything yet (shown as not insured) */
  insured: boolean; recorded: boolean; since: string | null; provider: string; monthly: string; companyShare: string | null; note: string | null;
  files: { id: string; name: string }[]; updatedAt: string | null;
}
export interface InsuranceView { items: InsuranceRow[]; totals: { insured: number; monthly: string; companyShare: string } }
