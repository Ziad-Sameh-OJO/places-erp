import { z } from "zod";

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

/** What a form offers: the active values only. */
export const activeValues = (items: readonly ListItem[]): string[] => items.filter((i) => i.active).map((i) => i.value);

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
  slaRules: z.object({
    warnAfter: z.number().int().min(10).max(24 * 60), pullAfter: z.number().int().min(10).max(24 * 60),
    holidayWarnAfter: z.number().int().min(10).max(72 * 60), holidayPullAfter: z.number().int().min(10).max(72 * 60),
  }).refine((r) => r.warnAfter < r.pullAfter && r.holidayWarnAfter < r.holidayPullAfter, "التنبيه لازم يكون قبل السحب"),
} as const;
export type SettingKey = keyof typeof SETTINGS;
export type Settings = { [K in SettingKey]: z.infer<(typeof SETTINGS)[K]> };
export const SettingKeyParam = z.enum(Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]]);

export const HolidayInput = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().trim().min(2).max(80) });
export type HolidayInput = z.infer<typeof HolidayInput>;
/** 2026-02-30 parses (as March 2nd), so check the date survives the round trip. */
const realDay = (d: string) => { const t = new Date(`${d}T00:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d; };
/** A row of the holidays sheet (M-13): same fields as the form, Arabic messages for the import screen. */
export const HolidayRow = z.object({
  day: z.string({ required_error: "التاريخ ناقص" }).regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ لازم يبقى YYYY-MM-DD").refine(realDay, "تاريخ مش موجود"),
  label: z.string({ required_error: "اسم الإجازة ناقص" }).trim().min(2, "اسم الإجازة قصير").max(80, "اسم الإجازة طويل"),
});

export const RuleInput = z.object({ channels: z.array(z.enum(["app", "push", "email"])).max(3) });
export const Preferences = z.object({ emailNotifications: z.boolean() });
