import { z } from "zod";
import { Id, Money } from "./common.ts";

/** M-12 · scheduled reports (11.10), the daily report (11.12), monthly targets and ranking (11.8). Wording from demo clients.js · kpis.js. */

const names = z.array(z.string().min(1).max(40)).max(40);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "اليوم مش صحيح");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر مش صحيح");

/** «التقارير ومواعيدها»: one report's schedule, who prepares it, who gets it. */
export const ReportInput = z.object({
  name: z.string().trim().min(1, "التقرير لازم يبقى ليه اسم").max(160),
  on: z.boolean().default(true),
  kind: z.enum(["auto", "handin"]),
  freq: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  day: z.number().int().min(0).max(31).default(0),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "الساعة مش صحيحة"),
  fmt: z.enum(["جوه السيستم", "PDF", "Excel"]).default("جوه السيستم"),
  content: z.enum(["performance", "inventory"]).nullable().default(null), // inventory: M-03 3.1 daily report (2.18), approved by `preparedBy`
  preparedBy: names.default([]),
  recipients: names.min(1, "مين بيستلمه؟"),
  remindMin: z.number().int().min(0).max(10_080).default(60),
  lateNotify: names.default([]),
  money: z.boolean().default(false),
  /** KPI items (report method) that count this report's on-time hand-ins */
  kpiItems: z.array(Id).max(60).default([]),
}).superRefine((r, ctx) => {
  if (r.kind === "handin" && !r.preparedBy.length) ctx.addIssue({ code: "custom", path: ["preparedBy"], message: "مين بيحضّره ويسلّمه؟" });
  if (r.kind === "auto" && !r.content) ctx.addIssue({ code: "custom", path: ["content"], message: "السيستم بيبعت إيه؟" });
  if (r.kind === "auto" && r.content === "inventory" && !r.preparedBy.length) ctx.addIssue({ code: "custom", path: ["preparedBy"], message: "مين بيعتمده قبل ما يتبعت؟" });
  if (r.freq === "weekly" && r.day > 6) ctx.addIssue({ code: "custom", path: ["day"], message: "اختار يوم في الأسبوع" });
  if ((r.freq === "monthly" || r.freq === "quarterly") && r.day < 1) ctx.addIssue({ code: "custom", path: ["day"], message: "يوم كام في الشهر؟" });
});
export type ReportInput = z.infer<typeof ReportInput>;

export interface ReportRunView { id: string; period: string; at: string; title: string }
export interface ScheduledReportView extends Omit<ReportInput, "kpiItems"> {
  id: string; daily: boolean;
  /** «الجاي»: the next due moment */
  next: string;
  /** this period's hand-ins (handin only) */
  handed: { got: number; of: number } | null;
  kpiItems: { id: string; label: string }[];
  runs: ReportRunView[];
}
export interface ReportsPage {
  reports: ScheduledReportView[];
  can: { edit: boolean };
  options: { people: { id: string; name: string }[]; roles: { key: string; label: string }[]; items: { id: string; label: string }[] } | null;
}
/** The home's «سلّم» tasks: hand-ins due today and not handed in. */
export interface MyHandIn { reportId: string; name: string; due: string; late: boolean; daily: boolean; kpi: boolean }

// ───────── 11.12 · the daily report ─────────

export const DailyInput = z.object({
  values: z.record(z.union([z.number().min(0).max(1e9), z.string().trim().max(500)])).default({}),
  note: z.string().trim().max(4000).default(""),
});
export type DailyInput = z.infer<typeof DailyInput>;
export const DailyFieldInput = z.object({ userId: Id, label: z.string().trim().min(1, "اكتب اسم الخانة").max(120), type: z.enum(["number", "text"]) });
export type DailyFieldInput = z.infer<typeof DailyFieldInput>;
export const DayQuery = z.object({ userId: Id, day: day.optional() });
export type DayQuery = z.infer<typeof DayQuery>;

export type DayStatusView = "onTime" | "late" | "missing" | "off" | "open";
export interface DailyItem { key: string; title: string; target: string; auto: boolean; value: number | null }
export interface DailyForm {
  day: string; due: string; status: DayStatusView;
  /** KPI items: the system's figure for today, or typed by the person */
  items: DailyItem[];
  fields: { id: string; label: string; type: "number" | "text" }[];
  saved: { values: Record<string, number | string>; note: string; at: string } | null;
}
export interface DayReport {
  person: { userId: string; name: string };
  form: DailyForm;
  /** each KPI item that day, next to the last 7 days, the month and the quarter and its achievement */
  rows: { title: string; calc: string; day: number | null; week: number | null; month: number | null; quarter: number | null; target: string; achievement: number }[];
  /** who of the people I see handed in that day */
  team: { userId: string; name: string; handed: boolean }[];
  /** «شكل التقرير»: each field, how it's filled and where it goes */
  shape: { label: string; how: string; goes: string; fieldId: string | null }[];
  can: { fields: boolean };
  /** «بيروح لـ … · لو اتأخر يتبلّغ …» */
  to: string; late: string; time: string;
}

// ───────── 11.8 · monthly targets ─────────

export const TargetMonthQuery = z.object({ month: month.optional() });
export type TargetMonthQuery = z.infer<typeof TargetMonthQuery>;
export const TargetInput = z.object({
  employeeId: Id, month,
  value: Money,
  deals: z.number().int().min(0, "مايبقاش سالب").max(1000),
  visits: z.number().int().min(0, "مايبقاش سالب").max(10_000),
});
export type TargetInput = z.infer<typeof TargetInput>;
export const TransactionsQuery = z.object({ from: day, to: day });
export type TransactionsQuery = z.infer<typeof TransactionsQuery>;

export interface TargetRow {
  employeeId: string; name: string; team: string | null; tl: string | null;
  value: string; deals: number; visits: number;
  achieved: string; percent: number; transactions: number; visitsDone: number;
  /** «تحت المعدل»: the TL hears of it */
  behind: boolean; rank: number;
  pending: { value: string; deals: number; visits: number; by: string } | null;
}
export interface TeamRow {
  tlId: string; tl: string; team: string | null; members: string[];
  goal: string; achieved: string; percent: number;
  /** average achievement of its salespeople */
  avg: number; tierPercent: number; commission: string;
}
export interface TargetsView {
  month: string; label: string;
  /** how much of the month has gone by */
  dayPercent: number;
  rows: TargetRow[]; teams: TeamRow[];
  can: { edit: boolean; approve: boolean };
}
export interface TransactionRow { dealId: string; code: string; type: string; company: string; status: string; collected: string; firstAt: string; people: string }
