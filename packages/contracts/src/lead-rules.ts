import { z } from "zod";
import type { LeadRules } from "@places/domain";

/** 1.29 · «قواعد الليدز والتوزيع»: the shape the page saves; the domain refuses bad combinations (leadRulesProblem). */
const who = z.object({
  to: z.array(z.string().trim().min(1).max(40)).max(30).transform((t) => [...new Set(t)]),
  ch: z.array(z.enum(["app", "push", "email"])).max(3).transform((c) => [...new Set(c)]),
});
const minutes = (label: string, max: number) => z.number({ invalid_type_error: `${label} رقم`, required_error: `${label} ناقص` }).int(`${label} رقم صحيح`).positive(`${label} لازم يبقى أكبر من صفر`).max(max, `${label} كبير أوي`);
const DAY_MIN = 24 * 60;

export const LeadRulesInput = z.object({
  work: z.object({
    from: z.number().int().min(0, "الميعاد غلط").max(DAY_MIN - 1, "الميعاد غلط"),
    to: z.number().int().min(1, "الميعاد غلط").max(DAY_MIN, "الميعاد غلط"),
    off: z.array(z.number().int().min(0).max(6)).max(7).transform((d) => [...new Set(d)].sort()),
  }),
  sla: z.object({
    on: z.boolean(), warnMin: minutes("التنبيه", 7 * DAY_MIN), pullMin: minutes("السحب", 7 * DAY_MIN),
    holWarnMin: minutes("التنبيه يوم الإجازة", 7 * DAY_MIN), holPullMin: minutes("السحب يوم الإجازة", 7 * DAY_MIN), warn: who, pull: who,
  }),
  newLead: who,
  noAnswer: z.object({
    hours: minutes("ساعات الـ No Answer", 24 * 14), remindH: minutes("التنبيه", 24 * 14),
    toTelesalesAt: z.number().int("الروتيشن رقم صحيح").min(2, "الروتيشن رقم 2 على الأقل").max(20, "الروتيشن كبير أوي"),
    telesales: z.string().min(1).max(40).nullable(), notify: who,
  }),
  visit: z.object({ postpone: who, postponeInfo: who, notDone: who }),
  close: z.object({ alarmH: minutes("ساعات الـ Alarm", 24 * 30), notify: who }),
  draft: z.object({ on: z.boolean(), days: minutes("الأيام", 365), holdDays: minutes("أيام الـ Hold", 365), see: who, notify: who }),
  draftAdmin: z.object({ on: z.boolean(), see: who, notify: who }),
}) satisfies z.ZodType<LeadRules, z.ZodTypeDef, unknown>;
export type LeadRulesInput = z.infer<typeof LeadRulesInput>;

/** The page's lists: roles and people for «مين يتبلّغ», and the Telesales who receive No Answer leads. */
export interface LeadRulesOptions {
  roles: { key: string; label: string }[];
  people: { id: string; name: string }[];
  telesales: { id: string; name: string }[];
}
