import { z } from "zod";

/**
 * M-13: every setting the admin can change without a developer, with its shape. The API refuses unknown keys
 * and malformed values, so a typo can't break the screens that read them.
 */
const List = z.array(z.string().trim().min(1).max(80)).max(500);
export const SETTINGS = {
  areas: List,
  channels: List,
  companyCategories: List,
  vendors: List,
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
