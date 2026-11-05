import { z } from "zod";
import { Id, Money } from "./common.ts";

/** M-12 · KPI cards (11.1–11.4 · 11.11 · 11.14). Wording from demo kpis.js. */

const text = (max: number, missing: string) => z.string({ required_error: missing, invalid_type_error: missing }).trim().min(1, missing).max(max, `${missing} · طويل`);

/** One item as the editor saves it (11.3 · 11.11). `id` keeps an existing item (its value and hand-ins stay). */
export const KpiItemInput = z.object({
  id: Id.optional(),
  title: text(160, "اكتب اسم البند"),
  weight: z.number({ invalid_type_error: "الوزن رقم" }).int("الوزن رقم صحيح").min(0, "الوزن من 0 لـ 100").max(100, "الوزن من 0 لـ 100"),
  targetText: z.string().trim().max(200, "المستهدف طويل").default(""),
  source: z.string().trim().max(200, "المصدر طويل").default(""),
  method: z.enum(["system", "report", "manual"], { errorMap: () => ({ message: "اختار بيتحسب إزاي" }) }),
  module: z.string().trim().max(10).nullable().default(null),
  direction: z.enum(["at-least", "at-most"]).default("at-least"),
  goal: z.number({ invalid_type_error: "المستهدف بالرقم ناقص" }).min(0, "المستهدف مايبقاش سالب").max(1e9),
  metric: z.string().max(40).nullable().default(null),
  params: z.record(z.union([z.string().max(200), z.number()])).default({}),
  enteredBy: z.array(z.string().min(1).max(40)).max(10).default(["follower"]),
  required: z.number().int().min(1, "مطلوب كام مرة؟").max(400).nullable().default(null),
}).superRefine((it, ctx) => {
  if (it.method === "report" && !it.required) ctx.addIssue({ code: "custom", path: ["required"], message: `«${it.title}»: مطلوب كام مرة في الربع؟` });
  if (it.method === "manual" && !it.enteredBy.length) ctx.addIssue({ code: "custom", path: ["enteredBy"], message: `«${it.title}»: مين بيدخّل الرقم؟` });
});
export type KpiItemInput = z.infer<typeof KpiItemInput>;

/** The whole card's items in one save: «مجموع الأوزان لازم يبقى 100%» (M-12 3.1). */
export const KpiItemsInput = z.object({ items: z.array(KpiItemInput).min(1, "الكارت من غير بنود").max(30) })
  .refine((c) => c.items.reduce((s, it) => s + it.weight, 0) === 100, (c) => ({ message: `مجموع الأوزان دلوقتي ${c.items.reduce((s, it) => s + it.weight, 0)}% · لازم يبقى 100%`, path: ["items"] }));
export type KpiItemsInput = z.infer<typeof KpiItemsInput>;

export const KpiValueInput = z.object({ value: z.number({ required_error: "اكتب الرقم", invalid_type_error: "اكتب الرقم" }).min(-1e9).max(1e9) });
export type KpiValueInput = z.infer<typeof KpiValueInput>;

/** «سلّمت» (11.2): a link or an uploaded file. */
export const KpiDeliveryInput = z.object({
  link: z.string().trim().url("اللينك مش صحيح").max(500).optional(),
  fileId: Id.optional(),
}).refine((d) => d.link || d.fileId, { message: "حط لينك أو ارفع ملف" });
export type KpiDeliveryInput = z.infer<typeof KpiDeliveryInput>;

export const KpiFollowerInput = z.object({ followerId: Id.nullable() }); // null = the owners
export type KpiFollowerInput = z.infer<typeof KpiFollowerInput>;
export const KpiPlanInput = z.object({ plan: z.string().trim().max(2000, "الخطة طويلة") });
export type KpiPlanInput = z.infer<typeof KpiPlanInput>;
/** 11.4: what the result moves, how often, and the bonus (null = one month's salary). */
export const KpiPayInput = z.object({ base: z.enum(["salary", "bonus"]), period: z.enum(["month", "quarter"]), amount: Money.nullable() });
export type KpiPayInput = z.infer<typeof KpiPayInput>;

const pct = z.number({ invalid_type_error: "رقم" }).int().min(0).max(200);
export const KpiBandsInput = z.object({ top: pct, full: pct, partial: pct, low: pct, rewardPercent: pct, cutPercent: pct })
  .refine((b) => b.top >= b.full && b.full > b.partial && b.partial > b.low, { message: "الشرايح لازم تبقى بالترتيب: المكافأة ≥ الكامل > الجزئي > الـ Threshold" });
export type KpiBandsInput = z.infer<typeof KpiBandsInput>;

/** «اعمل كارت» for someone without one (11.4): empty, or with another card's items. */
export const KpiNewCardInput = z.object({ employeeId: Id, copyFrom: Id.optional() });
export type KpiNewCardInput = z.infer<typeof KpiNewCardInput>;
export const KpiCopyInput = z.object({ toEmployeeId: Id });
export type KpiCopyInput = z.infer<typeof KpiCopyInput>;
/** 11.14 · «مسؤول الـ KPIs»: the Setting `kpiWatch`, user ids. */
export const KpiWatch = z.array(Id).max(20);
export const KpiWatchInput = z.object({ userIds: KpiWatch });
export type KpiWatchInput = z.infer<typeof KpiWatchInput>;
export const KpiScope = z.object({ scope: z.enum(["me", "team", "all"]).default("me") });
export type KpiScope = z.infer<typeof KpiScope>;

export interface KpiQuarterView { id: string; label: string; status: "open" | "closed" }
export interface KpiCardSummary {
  id: string; employeeId: string; name: string; title: string; follower: string;
  score: number; tone: "ok" | "warn" | "bad"; tier: string; below: number; approved: boolean;
  /** reward (+) or deduction (−); null for whoever doesn't see money (11.14) */
  money: string | null;
}
export interface KpiBoard { quarter: KpiQuarterView; cards: KpiCardSummary[]; seesMoney: boolean; seesAll: boolean }

export interface KpiItemView {
  id: string; key: string; title: string; weight: number; targetText: string; source: string;
  method: "system" | "report" | "manual"; module: string | null; direction: "at-least" | "at-most"; goal: number;
  metric: string | null; params: Record<string, string | number>; enteredBy: string[]; report: string | null; required: number | null;
  value: number | null; delivered: number; deliveries: { id: string; at: string; link: string | null; file: boolean }[];
  /** «بيتحسب: …» */
  calc: string; achievement: number; contribution: number; canEnter: boolean; canDeliver: boolean;
}
export interface KpiPerson { id: string; userId: string; name: string }
export interface KpiCardView {
  id: string; quarter: KpiQuarterView; employee: { id: string; name: string; title: string };
  follower: { id: string | null; name: string };
  score: number; tone: "ok" | "warn" | "bad"; tier: string; plan: string | null;
  approved: { by: string; at: string } | null;
  /** null for whoever doesn't see money (11.14) */
  pay: { base: "salary" | "bonus"; period: "month" | "quarter"; amount: string | null; salary: string; delta: string } | null;
  items: KpiItemView[];
  can: { manage: boolean; approve: boolean; plan: boolean; pay: boolean; admin: boolean };
  /** for the editor's pickers, to whoever manages the card */
  options: { people: KpiPerson[]; roles: { key: string; label: string }[] } | null;
}
export interface KpiCompany {
  quarters: { id: string; label: string; status: string; cards: number; avg: number | null }[];
  noCard: { id: string; name: string; title: string }[];
  watchers: KpiPerson[];
  people: KpiPerson[];
  /** null for the watcher (money) */
  bands: KpiBandsInput | null;
  can: { edit: boolean; close: boolean };
}
export interface KpiLogEntry { at: string; by: string; text: string }
