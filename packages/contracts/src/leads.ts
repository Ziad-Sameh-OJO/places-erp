import { z } from "zod";
import { LEAD_STAGES } from "@places/domain";
import { CalendarDay, EgyptianMobile, Id, Money, Page } from "./common.ts";

/** A lead is a client or a broker (client meeting 4 Nov · 1.28): brokers have their own tab, same stages. */
export const LeadKind = z.enum(["client", "broker"]);
export type LeadKind = z.infer<typeof LeadKind>;

/** Messages are shown to the person as they are: Arabic, like the demo. */
export const CreateLead = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(120, "الاسم طويل"),
  kind: LeadKind.default("client"), // the form's «ده: Client / Broker»
  company: z.string().trim().max(160, "اسم الشركة طويل").optional(),
  companyCategory: z.string().trim().max(80).optional(), // Telesales: «أضيفها لشيت الشركات» under this category (1.20)
  // the same mobile written twice is kept once
  phones: z.array(EgyptianMobile).min(1, "اكتب رقم موبايل").max(5, "5 أرقام بالكتير").transform((ps) => [...new Set(ps)]),
  area: z.string().min(1, "اختار الـ Area"),
  type: z.enum(["Rent", "Resale", "Primary", "Income"]),
  space: z.number().int("المساحة رقم صحيح").positive("المساحة لازم تبقى أكبر من صفر").optional(),
  condition: z.string().optional(),
  budget: Money.optional(),
  channel: z.string().min(1, "اختار الـ Channel"),
  campaignId: Id.optional(),
  assignToId: Id.optional(), // Operations choosing a salesperson by hand (uses up their turn)
  keep: z.boolean().optional(), // Telesales: «يفضل عندي (بكلّمه أنا)» instead of «التوزيع (حسب الـ area)»
  note: z.string().max(2000, "الملاحظة طويلة · 2000 حرف بالكتير").optional(),
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
  kind: LeadKind.optional(), // the page's tab: «الليدز» (client) or «البروكرز»
  from: CalendarDay.optional(), // Cairo days, both ends included
  to: CalendarDay.optional(),
}).refine((f) => !f.from || !f.to || f.from <= f.to, { path: ["to"], message: "«لحد» قبل «من»" });
export type LeadFilters = z.infer<typeof LeadFilters>;

/** The new-lead form checks the mobiles while they're typed (demo «الرقم ده موجود قبل كده»). */
export const DuplicateCheck = z.object({ phones: z.string().max(200).transform((s) => s.split(",").map((p) => p.replace(/\D/g, "")).filter((p) => /^01[0-25]\d{8}$/.test(p))) });
export type DuplicateCheck = z.infer<typeof DuplicateCheck>;
/** The existing lead's code; its id only when the person may open it (M-01 Q7: only Operations sees both clients). */
export interface DuplicateHit { code: string; leadId: string | null }
export interface DuplicateCheckResult { hit: DuplicateHit | null }

/** What a new lead answers: its code and who it went to («الليد راح لـ …»). */
export interface CreatedLead { id: string; code: string; ownedByTelesales: boolean; assignedTo: { id: string; name: string } | null }

/** A comment or a call result written on the lead's Activity tab (demo: «اكتب كومنت أو نتيجة مكالمة»). */
export const AddComment = z.object({ text: z.string().trim().min(1, "اكتب الكومنت").max(2000, "الكومنت طويل · 2000 حرف بالكتير") });
export type AddComment = z.infer<typeof AddComment>;

/** One row of the leads list: what the table and the Kanban card show, nothing more. */
export interface LeadRow {
  id: string; code: string; name: string; phones: string[]; area: string; type: string; space: number | null; budget: string | null; channel: string;
  campaign: { id: string; name: string } | null; stage: string; qualified: boolean; touched: boolean; kind: LeadKind;
  ownedByTelesales: boolean; // demo: «مع Telesales» — she keeps it to call herself, no SLA
  /** the SLA clock while the lead is Fresh and untouched (null otherwise): level, minutes left, % of the way to the pull */
  sla: { level: "ok" | "warn" | "pull"; minutesLeft: number; pct: number } | null;
  assignedTo: { id: string; name: string } | null; assignedAt: string | null; arrivedAt: string; createdAt: string;
}

/** One line of the lead's Activity: what happened, who did it (null = the system) and when. */
export interface LeadActivityRow {
  id: string; kind: string; text: string; by: { id: string; name: string } | null; at: string;
}

/** The lead drawer (M-01): the list row plus the details and the Activity, newest first. */
export interface LeadDetail extends LeadRow {
  company: string | null; condition: string | null; note: string | null;
  post: string | null; // the campaign post it came from (demo «البوست اللي جابه»)
  /** the first logged call, and whether it came within 30 minutes of arrival (KPI; null until someone calls) */
  firstCallAt: string | null; firstCallOnTime: boolean | null;
  /** the «Logs» tab is shown only when this is true (the admin, or a role the admin picked · 1.25) */
  canSeeLogs: boolean;
  /** how many lines the Logs tab has (its label shows it, like the demo); null when the person can't see it */
  logCount: number | null;
  noAnswerCount: number; rotation: number; firstActionAt: string | null; activities: LeadActivityRow[];
  /** Telesales sent it as a New Lead and Operations hasn't routed it yet (1.17): «مستني قرار الأوبريشن» */
  newLeadPending: boolean;
  /** «الزيارات» (1.9): every Visit / Meeting, newest time first */
  visits: VisitRow[];
}

/** A unit as the Visit form lists it (demo: «U-101 · المشروع · 120 م»). */
export interface VisitUnit { id: string; code: string; project: string; space: number }
/** One Visit / Meeting: null outcome = not marked yet; `due` = its time came and nobody marked it (the Alarm). */
export interface VisitRow {
  id: string; kind: "Visit" | "Meeting"; at: string; extra: string | null; outcome: "done" | "not_done" | null; due: boolean; units: VisitUnit[];
  /** 1.24 «اتأجلت»: null = never asked; `canDecide` = the caller is whom the lead rules name to approve */
  postpone: { status: "pending" | "approved" | "rejected"; reason: string; canDecide: boolean } | null;
}
/** «اتأجلت» (1.24): the reason is a must. */
export const VisitPostpone = z.object({ reason: z.string({ required_error: "اكتب سبب التأجيل" }).trim().min(3, "اكتب سبب التأجيل").max(300) });
export type VisitPostpone = z.infer<typeof VisitPostpone>;
/** «وافق على التأجيل» / «ارفض». */
export const PostponeDecision = z.object({ approve: z.boolean({ required_error: "وافق أو ارفض", invalid_type_error: "وافق أو ارفض" }) });
export type PostponeDecision = z.infer<typeof PostponeDecision>;

/** «ترتيب الروتيشن النهارده» (1.23): who comes first today, and what put them there (fingerprint or Visit time). */
export interface RotationView { day: string; manual: boolean; people: { id: string; name: string; start: string | null; visit: string | null }[] }
/** The order by hand, for today only. */
export const RotationOrder = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(200) });
export type RotationOrder = z.infer<typeof RotationOrder>;

/** «Visit / Meeting جديدة» and «تعديل الميعاد» (demo form, M-01 3.3): the kind, the time, units from the inventory, spaces not in the sheet. */
export const VisitInput = z.object({
  kind: z.enum(["Visit", "Meeting"], { required_error: "اختار النوع", invalid_type_error: "اختار النوع" }),
  at: z.string({ required_error: "اختار الميعاد" }).datetime({ offset: true, message: "اختار الميعاد" }),
  unitIds: z.array(z.string().min(1).max(40)).max(30, "30 وحدة بالكتير").default([]).transform((u) => [...new Set(u)]),
  extra: z.string().trim().max(300, "300 حرف بالكتير").optional().transform((s) => s || undefined),
});
export type VisitInput = z.infer<typeof VisitInput>;

/** «Done» or «معملتهاش». */
export const VisitOutcome = z.object({ outcome: z.enum(["done", "not_done"], { required_error: "اختار", invalid_type_error: "اختار" }) });
export type VisitOutcome = z.infer<typeof VisitOutcome>;

/** The Visit form's unit search: by code, project or space (4 Nov demo meeting). */
export const VisitUnitQuery = z.object({ q: z.string().trim().max(80).optional() });
export type VisitUnitQuery = z.infer<typeof VisitUnitQuery>;

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

/** The tiles follow the tab: clients or brokers. */
export const SummaryQuery = z.object({ kind: LeadKind.default("client") });
export type SummaryQuery = z.infer<typeof SummaryQuery>;
/** Each tab's count under the current filters (they stay when moving between tabs · 1.28). */
export interface LeadTabCounts { client: number; broker: number }

/** The KPI tiles and the saved views' counts, over the caller's whole scope (not the current filters). */
export interface LeadSummary {
  total: number; fresh: number; qualified: number; noAnswer: number; interested: number;
  /** leads that came in the last 7 days and the 7 before, for «مقارنة بالأسبوع اللي فات» */
  thisWeek: number; lastWeek: number;
  /** an official holiday today: the SLA runs on wall-clock hours (the note under the list says so) */
  /** today is an official holiday; the SLA times (minutes) from «قواعد الليدز» (1.29), and whether that rule is on */
  holidayMode: boolean; slaRules: { warnAfter: number; pullAfter: number; holidayWarnAfter: number; holidayPullAfter: number }; slaOn: boolean;
  /** «قواعد الليدز ← No Answer»: how long it stays, how often the Alarm comes (the «بعتله واتساب؟» note, 1.18) */
  noAnswerRules: { hours: number; remindH: number };
  /** leads waiting in the Draft tab (1.26), or null when this person isn't one «مين يشوف الـ Draft» names */
  drafts: number | null;
  /** «قواعد الليدز ← Draft»: the idle days, and on Hold (the Draft tab's note) */
  draftRules: { days: number; holdDays: number };
  /** the Draft Admin (1.27) for the people «قواعد الليدز» names: all waiting, still undecided, and today's (the Alarm); else null */
  draftAdmin: { total: number; waiting: number; today: number } | null;
}

/** One line of a lead's «Logs» tab: recorded automatically, a person's comment, or an audit entry (1.25). */
export interface LeadLogRow {
  id: string; source: "auto" | "comment" | "audit"; text: string; by: { id: string; name: string } | null; at: string;
}

/** The person's own call count against their KPI (demo «مكالماتك النهارده: … من 100»); no goal for other roles. */
export interface MyCalls { goal: { period: "day" | "week"; target: number } | null; count: number }

/** The Kanban: every stage with its real count under the filters, and its newest cards (the demo shows 30 per lane). */
export interface LeadBoard { lanes: { stage: string; total: number; items: LeadRow[] }[] }

/** The filters' choices that aren't settings lists: campaigns, and the salespeople inside the caller's scope. */
export interface LeadOptions {
  campaigns: { id: string; name: string; channel: string }[];
  salespeople: { id: string; name: string }[];
  /** «اسحب الليد وحوّله» (1.14): the salespeople a lead can be handed to; empty for whoever may not */
  assignable: { id: string; name: string }[];
}

/** «مين يشوف الـ Logs» (demo: a card in the lead's Logs tab, for whoever manages access): the roles besides the admin. */
export const LogRoles = z.object({ roles: z.array(z.string().trim().min(1).max(40)).max(30).transform((r) => [...new Set(r)]) });
export type LogRoles = z.infer<typeof LogRoles>;

/** One tick in «إعدادات توزيع المناطق» (1.12): this salesperson covers this area, or no longer does. */
export const RoutingCell = z.object({
  area: z.string({ required_error: "اختار الـ Area" }).trim().min(1, "اختار الـ Area").max(80),
  employeeId: z.string({ required_error: "اختار السيلز" }).min(1, "اختار السيلز").max(40),
  on: z.boolean({ required_error: "اه أو لا", invalid_type_error: "اه أو لا" }),
});
export type RoutingCell = z.infer<typeof RoutingCell>;
/** The routing table: the active areas (M-13 lists), the salespeople, and who covers each area in rotation order. */
export interface RoutingView { areas: string[]; salespeople: { id: string; name: string }[]; routing: Record<string, string[]> }

/** «اسحب الليد وحوّله» (1.14, M-01 4.1): Operations, the Sales Director and the admin hand a lead to a salesperson. */
export const AssignLead = z.object({ to: z.string({ required_error: "اختار السيلز", invalid_type_error: "اختار السيلز" }).min(1, "اختار السيلز").max(40) });
export type AssignLead = z.infer<typeof AssignLead>;

/**
 * The narrowing questions' answers (M-03 3.2, the requirements' proposed examples, as the demo asks them), kept on
 * the lead. An empty answer is «مش مهم».
 */
const blank = (v: unknown) => (v === "" || v === null ? undefined : v);
export const RecommendAnswers = z.object({
  project: z.preprocess(blank, z.string().trim().max(160).optional()),
  floor: z.preprocess(blank, z.literal("ground").optional()),
  parking: z.preprocess(blank, z.coerce.number().int().min(1, "الـ Parking من 1").max(20, "الـ Parking كبير أوي").optional()),
  area: z.preprocess(blank, z.literal("same").optional()),
  split: z.preprocess(blank, z.literal("no").optional()),
  payment: z.preprocess(blank, z.string().trim().max(80).optional()),
  deliveryBy: z.preprocess(blank, CalendarDay.optional()),
}).strict();
export type RecommendAnswers = z.infer<typeof RecommendAnswers>;

/** «اعمل PDF list وابعتها» (2.13, M-01 6.1 · M-03 6.1): the units picked for the client, in the order picked. */
export const UnitListInput = z.object({
  unitIds: z.array(z.string().min(1).max(40), { required_error: "اختار وحدة واحدة على الأقل", invalid_type_error: "اختار وحدة واحدة على الأقل" })
    .min(1, "اختار وحدة واحدة على الأقل").max(30, "30 وحدة بالكتير في اللستة").transform((u) => [...new Set(u)]),
});
export type UnitListInput = z.infer<typeof UnitListInput>;

/** A suggested unit as the lead's «الوحدات» tab shows it (no owner details: those are Manar's). */
export interface RecommendedUnit {
  id: string; code: string; type: string; project: string; area: string; floor: string | null; space: number; condition: string; parking: number;
  minSplit: number | null;
  /** the client's price: a month's rent (Rent) or the total; null when the unit has none for this type */
  price: string | null; monthly: boolean;
  split: boolean; sameArea: boolean; match: number;
}
/** The tab: what the client wants, the ± tolerance (a setting), the answers, the choices for the questions, the units. */
export interface Recommendations {
  tolerancePct: number;
  client: { type: string; space: number | null; condition: string | null; budget: string | null; area: string };
  answers: RecommendAnswers;
  projects: string[]; paymentMethods: string[];
  items: RecommendedUnit[];
}

/**
 * One line of «مهامي النهارده» (1.22, demo home.js) from the leads: a lead whose SLA clock is running out, or a
 * Visit / Meeting due today or late and not marked yet. `tone`: «bad» = late, "" = today.
 */
export interface LeadTodayItem {
  kind: "sla" | "visit"; tone: "bad" | "warn" | "";
  lead: { id: string; name: string }; salesperson: string | null;
  sla: LeadRow["sla"]; visit: { id: string; kind: "Visit" | "Meeting"; at: string } | null;
}

/**
 * «إدخال جماعي (شيت أرقام)» (1.19, M-01 · answers-leads-telesales): the mobiles as typed or read from a sheet, with
 * the channel and the campaign they came from. The server finds the mobiles in the text (bulkMobiles).
 */
export const BulkRequest = z.object({
  numbers: z.string({ required_error: "اكتب الأرقام" }).trim().min(1, "اكتب الأرقام").max(200_000, "الأرقام كتير · قسّمها"),
  channel: z.string({ required_error: "اختار الـ channel" }).trim().min(1, "اختار الـ channel").max(80),
  campaignId: Id.optional(),
});
export type BulkRequest = z.infer<typeof BulkRequest>;

/** «وافق ووزّع» or «ارفض الطلب» (the reason is required to reject). */
export const BulkDecision = z.object({ approve: z.boolean(), reason: z.string().trim().max(500).optional() })
  .refine((d) => d.approve || !!d.reason, { message: "اكتب سبب الرفض", path: ["reason"] });
export type BulkDecision = z.infer<typeof BulkDecision>;

/** «شيله» / «رجّعه» a salesperson from this request's distribution. */
export const BulkExclude = z.object({ excluded: z.boolean() });
export type BulkExclude = z.infer<typeof BulkExclude>;

export interface BulkSent { id: string; count: number; duplicates: number }
export interface BulkPerson { id: string; name: string; onLeave: boolean; excluded: boolean; count: number }
/** Operations' «مراجعة التوزيع»: how many are new, how many we already have, and each salesperson's share today. */
export interface BulkReview {
  id: string; at: string; by: { id: string; name: string }; channel: string; campaign: { id: string; name: string } | null;
  total: number; duplicates: number; fresh: number; people: BulkPerson[];
}

// ───────── 11.15 · Second Calls: Operations checks each of today's leads ─────────
export const SecondCallDone = z.object({ called: z.boolean(), sent: z.boolean(), note: z.string().trim().min(1, "اكتب النوت").max(1000) });
export type SecondCallDone = z.infer<typeof SecondCallDone>;
export interface SecondCallRow {
  id: string; code: string; name: string; channel: string; sales: string | null; createdAt: string;
  /** from a past day and still not done */
  late: boolean;
  done: { called: boolean; sent: boolean; note: string; at: string } | null;
}
/** 1.17 · a New Lead from Telesales waiting for Operations (demo «Telesales بعتت … كـ New Lead»), with its clock. */
export interface NewLeadRequestRow {
  id: string; code: string; name: string; area: string; requestedAt: string; by: { id: string; name: string } | null;
  /** minutes left of Operations' time (negative = late), from the server's clock */
  minutesLeft: number;
}

/** Operations' decision: «الروتيشن العادي» or a chosen salesperson (an employee id). */
export const RouteNewLead = z.object({ to: z.string({ required_error: "اختار", invalid_type_error: "اختار" }).min(1, "اختار").max(40) });
export type RouteNewLead = z.infer<typeof RouteNewLead>;
export const ROTATION = "rotation";

/** 1.26 · 1.27 · which Draft tab: «Draft» (idle leads) or «Draft Admin» (Not Interested / Cancellation). */
export const DraftKind = z.enum(["draft", "admin"]);
export type DraftKind = z.infer<typeof DraftKind>;
export const DraftQuery = z.object({ kind: DraftKind.default("draft") });
export type DraftQuery = z.infer<typeof DraftQuery>;

/** One lead waiting in a Draft tab (demo: الليد · المرحلة · كان عند · اتسحب · آخر أكشن · وزّعه على). */
export interface DraftRow {
  id: string;
  lead: { id: string; code: string; name: string; company: string | null; stage: string; kind: LeadKind; area: string };
  from: { id: string; name: string } | null;
  at: string; days: number | null; lastAction: string;
  /** «يفضل في الـ Draft» was chosen: it stays, the clock stopped */
  kept: boolean;
  /** minutes left of Operations' time to decide (negative = late) */
  minutesLeft: number;
}

/** Operations' decision: "keep" (stays), "rotation", or a salesperson's employee id (the one it came from = «رجّعه»). */
export const DraftDecision = z.object({ to: z.string({ required_error: "اختار", invalid_type_error: "اختار" }).min(1, "اختار").max(40) });
export type DraftDecision = z.infer<typeof DraftDecision>;
export const KEEP = "keep";
/** The Draft Admin's «Telesales» choice (1.27): the Telesales «قواعد الليدز» names. */
export const TELESALES = "telesales";
