import { z } from "zod";
import { Page } from "./common.ts";

/**
 * M-13: every setting the admin can change without a developer, with its shape. The API refuses unknown keys
 * and malformed values, so a typo can't break the screens that read them.
 */
/**
 * A list value (M-13 2.1 · 3.3): «نشط» shows in the forms; «موقوف» doesn't show for new records but stays on the old
 * ones (and in filters), so nothing is ever deleted from a list.
 */
export const ListItem = z.object({
  value: z.string({ required_error: "اكتب القيمة" }).trim().min(1, "اكتب القيمة").max(80, "القيمة طويلة · 80 حرف بالكتير"),
  active: z.boolean().default(true),
});
export type ListItem = z.infer<typeof ListItem>;
const List = z.array(ListItem).max(500, "القايمة كبيرة أوي")
  .refine((items) => new Set(items.map((i) => i.value)).size === items.length, "فيه قيمة متكررة في القايمة");

/** The lists of «الإعدادات ← القوايم», grouped like the demo (accountant meeting, 4 Nov). */
export const LIST_GROUPS = [
  { title: "المبيعات والليدز", lists: [["areas", "المناطق (Areas)"], ["channels", "الـ Channels"], ["paymentPlans", "طرق الدفع"], ["companyCategories", "كاتيجوريز الشركات"]] },
  { title: "الانفنتوري والعملاء", lists: [["finishings", "التشطيب"], ["interactionTypes", "أنواع التواصل مع العميل"]] },
  // «مصادر التوريد» aren't a list: they're «عمولة من عميل» + the «ايرادات اخري» (42) accounts of the chart (9.1)
  { title: "المالية والمشتريات", lists: [["vendors", "الموردين"]] },
  { title: "التسويق والتذاكر", lists: [["mkTaskTypes", "أنواع تاسكات التسويق"], ["ticketDepts", "أقسام التذاكر"]] },
] as const;
export type ListKey = (typeof LIST_GROUPS)[number]["lists"][number][0];

/**
 * Values the system posts or calculates on can't be switched off. None of today's lists has one: «عمولة من عميل»
 * moved to the chart of accounts with the receive sources (accountant's chart, 4 Nov · 9.1).
 */
export const LOCKED_VALUES: Partial<Record<ListKey, readonly string[]>> = {};

/** The values in use today (the demo's), until someone changes them. */
export const LIST_DEFAULTS: Record<ListKey, readonly string[]> = {
  areas: [], channels: [], companyCategories: [], vendors: [], // the seed writes the client's real ones
  paymentPlans: ["كاش", "تقسيط 3 سنين", "تقسيط 5 سنين"],
  finishings: ["متشطب", "نص تشطيب", "Core & Shell"],
  interactionTypes: ["مكالمة", "زيارة", "طلب", "شكوى", "ابديت مع المالك"],
  mkTaskTypes: ["Website leasing", "Market survey", "تصميم بوست", "تصوير فيديو"],
  ticketDepts: ["HR", "Inventory", "Marketing", "Accounts", "Operations", "الإدارة"],
};

/** Per list: the roles / people (user ids) who add, and who switch values off or back on (#186). Missing = «master: edit». */
const Names = z.array(z.string().trim().min(1).max(40)).max(50);
export const ListEditors = z.record(z.enum(Object.keys(LIST_DEFAULTS) as [ListKey, ...ListKey[]]), z.object({ add: Names, off: Names }));
export type ListEditors = z.infer<typeof ListEditors>;

/** What a form offers: the active values only. */
export const activeValues = (items: readonly ListItem[]): string[] => items.filter((i) => i.active).map((i) => i.value);

const Pct = z.number({ invalid_type_error: "النسبة رقم" }).min(0, "النسبة مابتبقاش بالسالب").max(100, "النسبة لحد 100");

export const SETTINGS = {
  areas: List,
  channels: List,
  companyCategories: List,
  vendors: List,
  paymentPlans: List,
  finishings: List,
  interactionTypes: List,
  mkTaskTypes: List,
  ticketDepts: List,
  leaveTypes: z.array(z.object({ name: z.string().trim().min(1).max(40), days: z.number().int().min(0).max(60) })).max(20),
  whatsappDailyLimit: z.number().int().min(0).max(10_000),
  notificationsFrom: z.string().trim().email(),
  // the roles that see a lead's «Logs» tab besides the admin (1.25); role keys from الأدوار والصلاحيات
  leadLogRoles: z.array(z.string().trim().min(1).max(40)).max(30),
  listEditors: ListEditors,
  // M-08 Q44: who may approve a purchase above 50,000 («أحمد أو صفوت»), by their sign-in email
  procurementBigApprovers: z.array(z.string().trim().toLowerCase().email()).max(10),
  // M-03 7.2 (needs-client, proposed ±20%): how near the space and the budget a recommended unit is (2.12)
  recommendTolerancePct: z.number({ invalid_type_error: "النسبة رقم" }).int("النسبة رقم صحيح").min(0, "النسبة مابتبقاش بالسالب").max(100, "النسبة لحد 100"),
  // M-12 2.1 step 5 · 5.8: «لو الفريق محقق أقل من below% ← الـ TL ياخد percent%»; the last tier's below is null («وأكتر»)
  tlTiers: z.array(z.object({
    below: z.number({ invalid_type_error: "النسبة رقم" }).positive("النسبة أكبر من صفر").max(1000).nullable(),
    percent: z.number({ invalid_type_error: "النسبة رقم" }).min(0, "النسبة مابتبقاش بالسالب").max(100, "النسبة لحد 100"),
  })).min(1, "لازم شريحة واحدة على الأقل").max(10)
    .refine((t) => t.every((x, i) => (i === t.length - 1 ? x.below === null : x.below !== null && (i === 0 || x.below > t[i - 1]!.below!))), "الشرايح بالترتيب من الأقل، وآخر واحدة «وأكتر»"),
  // 9.6 (needs-client, the demo's 5% · 0): a deal's operations / external commission as a % of Places' commission
  opsCommissionPct: Pct,
  externalCommissionPct: Pct,
} as const;
export type SettingKey = keyof typeof SETTINGS;
export type Settings = { [K in SettingKey]: z.infer<(typeof SETTINGS)[K]> };
export const SettingKeyParam = z.enum(Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]]);

/** 2026-02-30 parses (as March 2nd), so check the date survives the round trip. */
const realDay = (d: string) => { const t = new Date(`${d}T00:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d; };
const Day = (missing: string) => z.string({ required_error: missing, invalid_type_error: missing }).regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ لازم يبقى YYYY-MM-DD").refine(realDay, "تاريخ مش موجود");
const HolidayLabel = z.string({ required_error: "اسم الإجازة ناقص" }).trim().min(2, "اسم الإجازة قصير").max(80, "اسم الإجازة طويل");

/** An official holiday «من … لحد …» (1.29: an Eid is several days); one day = the same date twice. */
export const HolidayInput = z.object({ from: Day("اختار «من»"), to: Day("اختار «لحد»"), label: HolidayLabel })
  .refine((h) => h.from <= h.to, { path: ["to"], message: "«لحد» قبل «من»" });
export type HolidayInput = z.infer<typeof HolidayInput>;
/** A row of the holidays sheet (M-13): «من», «لحد» (empty = the same day) and the holiday, Arabic messages for the import screen. */
export const HolidayRow = z.object({
  from: Day("التاريخ «من» ناقص"),
  to: z.union([z.literal(""), Day("«لحد»")]).optional(),
  label: HolidayLabel,
}).transform((h) => ({ ...h, to: h.to || h.from })).refine((h) => h.from <= h.to, { path: ["to"], message: "«لحد» قبل «من»" });
export type HolidayRow = z.infer<typeof HolidayRow>;
export interface HolidayView { id: string; from: string; to: string; label: string }

export const RuleInput = z.object({ channels: z.array(z.enum(["app", "push", "email"])).max(3) });
export const Preferences = z.object({ emailNotifications: z.boolean() });

/**
 * M-14 (51): a device's push subscription, as the browser's PushSubscription.toJSON() gives it. Only https push
 * services: the API posts to this address, so it may never point inside the network.
 */
const PushEndpoint = z.string().url("عنوان الجهاز غلط").max(1000).refine((u) => u.startsWith("https://"), "عنوان الجهاز لازم يبقى https");
export const PushSubscriptionInput = z.object({
  endpoint: PushEndpoint,
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInput>;
export const PushEndpointInput = z.object({ endpoint: PushEndpoint });
/** «خروج» (M-14 51 · 12.10): this device's push address, so a shared phone stops getting the last person's notifications. */
export const Logout = z.object({ endpoint: PushEndpoint.optional() }).default({});
export type Logout = z.infer<typeof Logout>;

/** M-14 3.3 · 6.1: the send log, filtered by state: مستني · اتبعت · اتقرا · الإيميل فشل. */
export const MailLogQuery = Page.extend({ status: z.enum(["queued", "sent", "read", "failed"]).optional() });
export type MailLogQuery = z.infer<typeof MailLogQuery>;
export interface MailLogRow {
  id: string; to: string; subject: string; status: "queued" | "sent" | "read" | "failed"; attempts: number; error: string | null;
  createdAt: string; sentAt: string | null; readAt: string | null;
}
