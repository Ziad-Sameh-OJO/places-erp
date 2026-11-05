/**
 * 1.29 · «قواعد الليدز والتوزيع» (client demo meeting, 4 Nov): every timing and every person responsible for the
 * leads, editable without a developer. The jobs (SLA 1.16, No Answer 1.17, Draft 1.26, deal Alarm 5.6) read these,
 * never numbers in the code. Defaults are the demo's (data.js leadRules) and the requirements' (M-01 Q4, Q5).
 */
import type { SlaRules } from "./leads.ts";
import type { WorkCalendar } from "./business-time.ts";
import type { Channel } from "./notifications.ts";

/**
 * Who is told / responsible: a role key, a person (user id), «owner» (the lead's salesperson) or «ownerTl»
 * (that salesperson's Team Leader), each on its channels.
 */
export interface RuleWho { readonly to: readonly string[]; readonly ch: readonly Channel[] }
export const OWNER = "owner";
export const OWNER_TL = "ownerTl";

export interface LeadRules {
  /** the SLA clock: minutes after local midnight, weekdays off (0 = Sunday … 6 = Saturday) */
  readonly work: { readonly from: number; readonly to: number; readonly off: readonly number[] };
  readonly sla: {
    readonly on: boolean; readonly warnMin: number; readonly pullMin: number; readonly holWarnMin: number; readonly holPullMin: number;
    readonly warn: RuleWho; readonly pull: RuleWho;
  };
  readonly newLead: RuleWho;
  /** No Answer (M-01 Q5): hours with each salesperson, reminder every n hours, the rotation that goes to Telesales */
  readonly noAnswer: { readonly hours: number; readonly remindH: number; readonly toTelesalesAt: number; readonly telesales: string | null; readonly notify: RuleWho };
  readonly visit: { readonly postpone: RuleWho; readonly postponeInfo: RuleWho; readonly notDone: RuleWho };
  /** a deal closed within alarmH hours of the lead's creation raises an Alarm and stays out of the target (5.6) */
  readonly close: { readonly alarmH: number; readonly notify: RuleWho };
  readonly draft: { readonly on: boolean; readonly days: number; readonly holdDays: number; readonly see: RuleWho; readonly notify: RuleWho };
  readonly draftAdmin: { readonly on: boolean; readonly see: RuleWho; readonly notify: RuleWho };
}

/** The demo's values. Its named people (Heba, Hadeer) are their roles here: Operations, and «the Telesales». */
export const DEFAULT_LEAD_RULES: LeadRules = {
  work: { from: 11 * 60, to: 19 * 60, off: [5] },
  sla: { on: true, warnMin: 150, pullMin: 180, holWarnMin: 22 * 60, holPullMin: 24 * 60, warn: { to: ["tl", "salesdir"], ch: ["app", "push", "email"] }, pull: { to: ["ops", "salesdir"], ch: ["app", "push", "email"] } },
  newLead: { to: [OWNER, "tl"], ch: ["app", "push"] },
  noAnswer: { hours: 24, remindH: 4, toTelesalesAt: 3, telesales: null, notify: { to: ["telesales"], ch: ["app", "push"] } },
  visit: { postpone: { to: [OWNER_TL], ch: ["app", "push"] }, postponeInfo: { to: ["ops"], ch: ["app"] }, notDone: { to: ["hr"], ch: ["app", "email"] } },
  close: { alarmH: 24, notify: { to: ["officemgr", "admin"], ch: ["app", "push", "email"] } },
  draft: { on: true, days: 7, holdDays: 14, see: { to: ["ops"], ch: [] }, notify: { to: ["ops", OWNER], ch: ["app", "push"] } },
  draftAdmin: { on: true, see: { to: ["ops"], ch: [] }, notify: { to: ["ops"], ch: ["app"] } },
};

/** Why the rules can't be saved like that (Arabic, shown as is), or null. Like the demo's ruleSave checks. */
export function leadRulesProblem(r: LeadRules): string | null {
  if (r.sla.warnMin >= r.sla.pullMin || r.sla.holWarnMin >= r.sla.holPullMin) return "التنبيه لازم ييجي قبل السحب";
  if (r.work.from >= r.work.to) return "ميعاد البداية لازم يبقى قبل النهاية";
  if (r.work.off.length > 6) return "لازم يبقى فيه يوم شغل واحد على الأقل";
  if (r.noAnswer.remindH > r.noAnswer.hours) return "تنبيه المكالمة لازم ييجي قبل ما الليد يتنقل";
  if (r.draft.holdDays < r.draft.days) return "الـ Hold بيتسحب بعد مدة أطول من الليد العادي أو زيها";
  return null;
}

/** The SLA clock's numbers (domain slaView) from the rules. */
export const slaRulesOf = (r: LeadRules): SlaRules => ({ warnAfter: r.sla.warnMin, pullAfter: r.sla.pullMin, holidayWarnAfter: r.sla.holWarnMin, holidayPullAfter: r.sla.holPullMin });

/** The working calendar the SLA counts in: the rules' hours and weekdays off, plus the official holidays. */
export const calendarOf = (r: LeadRules, base: WorkCalendar): WorkCalendar => ({ ...base, startMinute: r.work.from, endMinute: r.work.to, weekendDays: [...r.work.off] });

/** The demo's A.dur, word for word: «3 ساعات», «ساعتين و30 دقيقة», «24 ساعة», «45 دقيقة». */
export function durationText(minutes: number): string {
  const hours = (h: number) => (h === 1 ? "ساعة" : h === 2 ? "ساعتين" : h <= 10 ? `${h} ساعات` : `${h} ساعة`);
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return !m ? hours(h) : h ? `${hours(h)} و${m} دقيقة` : `${m} دقيقة`;
}

/**
 * The official holidays as days: a holiday is a range «من … لحد …» (an Eid is several days, 1.29), every day of it
 * a holiday. Ranges longer than a year are cut to a year (a typo shouldn't freeze the calendar).
 */
export function holidayDays(ranges: readonly { from: string; to: string }[]): Set<string> {
  const out = new Set<string>();
  for (const { from, to } of ranges) {
    let t = Date.parse(`${from}T00:00:00Z`);
    const end = Math.min(Date.parse(`${to}T00:00:00Z`), t + 366 * 86_400_000);
    for (; t <= end; t += 86_400_000) out.add(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Who a rule reaches for one lead: «owner» becomes the lead's salesperson, «ownerTl» their Team Leader (dropped when
 * there's none); roles and people stay as they are (the notification service looks both up). Never twice.
 */
/** Whether this user is among whom a rule names, by account or by role (1.24: only they approve a postponement). */
export function ruleHas(who: RuleWho, lead: { readonly ownerUserId: string | null; readonly ownerTlUserId: string | null }, user: { readonly id: string; readonly roles: readonly string[] }): boolean {
  const to = ruleRecipients(who, lead);
  return to.includes(user.id) || user.roles.some((r) => to.includes(r));
}

export function ruleRecipients(who: RuleWho, lead: { readonly ownerUserId: string | null; readonly ownerTlUserId: string | null }): string[] {
  const out = who.to.flatMap((x) => (x === OWNER ? (lead.ownerUserId ? [lead.ownerUserId] : []) : x === OWNER_TL ? (lead.ownerTlUserId ? [lead.ownerTlUserId] : []) : [x]));
  return [...new Set(out)];
}
