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

export const RuleInput = z.object({ channels: z.array(z.enum(["app", "push", "email"])).max(3) });
export const Preferences = z.object({ emailNotifications: z.boolean() });
