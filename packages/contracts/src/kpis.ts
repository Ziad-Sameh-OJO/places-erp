import { z } from "zod";
import { SHEET_FIELD_KEYS, type SheetField } from "@places/domain";
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

/** 11.18 · «الخانات اللي في الورقة» and «الجوايز» of the quarterly sheet. */
export const KpiSheetFieldsInput = z.object({ fields: z.array(z.enum(SHEET_FIELD_KEYS as [SheetField, ...SheetField[]])).max(SHEET_FIELD_KEYS.length) });
export type KpiSheetFieldsInput = z.infer<typeof KpiSheetFieldsInput>;
export const KpiBonusInput = z.object({
  minPct: z.number({ invalid_type_error: "% من التارجت" }).int("% من التارجت رقم صحيح").min(1, "% من التارجت").max(1000, "% من التارجت"),
  amount: Money.refine((x) => Number(x) > 0, "الجايزة"),
});
export type KpiBonusInput = z.infer<typeof KpiBonusInput>;
export interface KpiSheetSetup { fields: SheetField[]; bonuses: { id: string; minPct: number; amount: string }[] }

/** «اعمل كارت» for someone without one (11.4): empty, or with another card's items. */
export const KpiNewCardInput = z.object({ employeeId: Id, copyFrom: Id.optional() });
export type KpiNewCardInput = z.infer<typeof KpiNewCardInput>;
export const KpiCopyInput = z.object({ toEmployeeId: Id });
export type KpiCopyInput = z.infer<typeof KpiCopyInput>;
/** 11.14 · «مسؤول الـ KPIs»: the Setting `kpiWatch`, user ids. */
export const KpiWatch = z.array(Id).max(20);
export const KpiWatchInput = z.object({ userIds: KpiWatch });
export type KpiWatchInput = z.infer<typeof KpiWatchInput>;
/** «mine» (11.19): my card and the ones I follow, Manar's «KPIs الفريق» in the inventory. */
export const KpiScope = z.object({ scope: z.enum(["me", "team", "mine", "all"]).default("me") });
export type KpiScope = z.infer<typeof KpiScope>;

export interface KpiQuarterView { id: string; label: string; status: "open" | "closed" }
export interface KpiCardSummary {
  id: string; employeeId: string; name: string; title: string; follower: string;
  score: number; tone: "ok" | "warn" | "bad"; tier: string; below: number; approved: boolean;
  /** reward (+) or deduction (−); null for whoever doesn't see money (11.14) */
  money: string | null;
}
export interface KpiBoard {
  quarter: KpiQuarterView; cards: KpiCardSummary[]; seesMoney: boolean; seesAll: boolean;
  /** 11.19 · scope «mine» for the Inventory Manager: her team's people without a card this quarter (else empty) */
  missing: { id: string; name: string; title: string }[];
}

/**
 * 11.16 · home (demo kpis.js kpiMine / kpiInbox): «الـ KPIs بتاعتي» (my card, the first 3 items under target) and the
 * KPI lines of «مهامي النهارده». `score` null when the person's field rules hide it (M-09).
 */
export interface KpiMineView {
  id: string; quarter: string; score: number | null; tone: "ok" | "warn" | "bad"; follower: string; belowCount: number;
  below: { title: string; targetText: string; method: "system" | "report" | "manual"; value: number | null; delivered: number; required: number | null }[];
}
export type KpiTodayLineView = { cardId: string; name: string; score: number | null } & (
  | { kind: "approve" | "enter"; manual: number }
  | { kind: "deliver"; item: string; delivered: number; required: number }
);
export interface KpiToday { mine: KpiMineView | null; lines: KpiTodayLineView[] }

export interface KpiItemView {
  id: string; key: string; title: string; weight: number; targetText: string; source: string;
  method: "system" | "report" | "manual"; module: string | null; direction: "at-least" | "at-most"; goal: number;
  metric: string | null; params: Record<string, string | number>; enteredBy: string[]; report: string | null; required: number | null;
  value: number | null; delivered: number; deliveries: { id: string; at: string; link: string | null; file: boolean }[];
  /** 11.15 · «5 في الميعاد من 8 · اتأخرت في: …» under a timed item; null for the rest */
  detail: string | null;
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
  can: { manage: boolean; approve: boolean; plan: boolean; pay: boolean; admin: boolean; sheet: boolean };
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
  can: { edit: boolean; close: boolean; sheets: boolean };
  /** 11.7: when the Office Manager approved and emailed the current quarter's sheets */
  sheets: { by: string; at: string } | null;
  /** 11.18: the sheet's lines and award rules; null for the watcher (money) */
  sheetSetup: KpiSheetSetup | null;
}
export interface KpiLogEntry { at: string; by: string; text: string }

/** 11.13 · «نشاط جديد»: Farming / Approach, where and when. */
export const ActivityInput = z.object({
  kind: z.enum(["Farming", "Approach"], { errorMap: () => ({ message: "اختار النوع" }) }),
  place: text(200, "اكتب المكان"),
  at: z.string({ required_error: "اختار الميعاد" }).datetime({ offset: true, message: "اختار الميعاد" }),
});
export type ActivityInput = z.infer<typeof ActivityInput>;

/** «عملتها؟»: done with what came of it (Farming: got + note · Approach: the companies), or «ماعملتهاش». */
export const ActivityResultInput = z.object({
  done: z.boolean(),
  got: z.boolean().default(false),
  note: z.string().trim().max(1000, "النوت طويلة").default(""),
  companies: z.array(z.string().trim().min(1).max(160)).max(50, "شركات كتير").default([]),
});
export type ActivityResultInput = z.infer<typeof ActivityResultInput>;

export interface ActivityView {
  id: string; kind: "Farming" | "Approach"; place: string; at: string; status: "planned" | "done" | "notDone";
  got: boolean | null; note: string | null; companies: string[];
}
/** «نشاطاتي»: shown to sales and to anyone whose card counts these activities. */
export interface MyActivities { show: boolean; items: ActivityView[] }

/** 11.20 · «مين يشوف التقارير»: the heads tick who else opens «التقارير والتارجت». */
export const ReportsAccessInput = z.object({ on: z.boolean() });
export type ReportsAccessInput = z.infer<typeof ReportsAccessInput>;
export interface ReportsAccessView { people: { userId: string; name: string; role: string }[]; on: string[] }
