/**
 * 1.29 · «قواعد الليدز والتوزيع» (client demo meeting, 4 Nov): every timing and every person responsible for the
 * leads, editable without a developer. The jobs (SLA 1.16, No Answer 1.17, Draft 1.26, deal Alarm 5.6) read these,
 * never numbers in the code. Defaults are the demo's (data.js leadRules) and the requirements' (M-01 Q4, Q5).
 */
import { type SlaRules, leadSla } from "./leads.ts";
import { type WorkCalendar, PLACES_CALENDAR, localDate, wallClockMinutesBetween, workingMinutesBetween } from "./business-time.ts";
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

/**
 * The saved rules over the defaults, deep (a rule added later gets its default until someone changes it). Objects
 * are merged; arrays and values are taken as saved. The API and the worker's jobs read the rules through this.
 */
export function withRuleDefaults(saved: unknown): LeadRules {
  return merge(DEFAULT_LEAD_RULES, saved);
}

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== "object" || Array.isArray(over) || !base || typeof base !== "object" || Array.isArray(base)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = k in out ? merge(out[k], v) : v;
  return out as T;
}

/** Is `now` on an official holiday (a day of one of the ranges), in the rules' calendar? Then the SLA runs on holiday times. */
export function isHolidayNow(rules: LeadRules, now: Date, holidays: ReadonlySet<string>): boolean {
  return holidays.has(localDate(now, calendarOf(rules, PLACES_CALENDAR)));
}

/**
 * 1.16 · what the SLA job does now to one untouched Fresh lead (M-01 Q4, 2.4): «warn» the people of sla.warn once
 * per assignment, «pull» it to the next salesperson, or nothing. The clock is the rules' working hours minus the
 * official holidays; on a holiday it is wall-clock with the holiday times (22 / 24 hours by default). A lead past
 * the pull time is pulled straight away: a warning then would come too late to help.
 */
export function slaStep(
  lead: { readonly assignedAt: Date; readonly warned: boolean },
  now: Date,
  rules: LeadRules,
  holidays: ReadonlySet<string>,
): "warn" | "pull" | null {
  if (!rules.sla.on) return null;
  const calendar = { ...calendarOf(rules, PLACES_CALENDAR), holidays };
  const sla = leadSla({ stage: "Fresh", touched: false, ownedByTelesales: false, assignedAt: lead.assignedAt }, now,
    { holidayMode: isHolidayNow(rules, now, holidays), calendar, rules: slaRulesOf(rules) });
  if (sla?.level === "pull") return "pull";
  return sla?.level === "warn" && !lead.warned ? "warn" : null;
}

/**
 * 1.17 · No Answer (M-01 Q5, 2.3 · 4 Nov meeting): a lead its own salesperson marked No Answer stays with them
 * noAnswer.hours (24 by default) counted from the mark, wall-clock (it moves «حتى لو الـ 24 ساعة خلصت في إجازة»),
 * then goes to the next salesperson as Fresh («next»), or to Telesales on the rotation the rules name (3rd by default).
 * A No Answer someone else marked doesn't count: the salesperson who has it must try first.
 */
export function noAnswerStep(
  lead: { readonly assignedToId: string | null; readonly naMarkedById: string | null; readonly naMarkedAt: Date | null; readonly rotation: number },
  now: Date,
  rules: LeadRules,
): "next" | "telesales" | null {
  if (!lead.naMarkedAt || !lead.assignedToId || lead.naMarkedById !== lead.assignedToId) return null;
  if (wallClockMinutesBetween(lead.naMarkedAt, now) < rules.noAnswer.hours * 60) return null;
  return lead.rotation + 1 >= rules.noAnswer.toTelesalesAt ? "telesales" : "next";
}

/**
 * 1.18 · M-01 Q5: while a lead sits in No Answer, its salesperson gets an Alarm every noAnswer.remindH (4) working
 * hours to call it again. The clock starts at the mark and restarts at every logged call and every Alarm sent (demo:
 * «سجّل المكالمة عشان يتقفل»); it counts the rules' working hours minus the official holidays, so nobody is woken at night.
 */
export function noAnswerReminderDue(
  lead: { readonly naMarkedAt: Date | null; readonly lastCallAt: Date | null; readonly remindedAt: Date | null },
  now: Date,
  rules: LeadRules,
  holidays: ReadonlySet<string>,
): boolean {
  if (!lead.naMarkedAt) return false;
  const since = [lead.naMarkedAt, lead.lastCallAt, lead.remindedAt].reduce<Date>((a, b) => (b && b > a ? b : a), lead.naMarkedAt);
  return workingMinutesBetween(since, now, { ...calendarOf(rules, PLACES_CALENDAR), holidays }) >= rules.noAnswer.remindH * 60;
}

/**
 * Minutes Operations has to route a New Lead from Telesales (demo: Heba's KPI item «توزيع الـ New Lead في ميعاده»,
 * 30 minutes by default · 11.15). The queue shows «باقي X د», or «اتأخر X د» once it's negative.
 */
export const NEW_LEAD_ROUTE_MIN = 30;
export function newLeadMinutesLeft(requestedAt: Date, now: Date, limit = NEW_LEAD_ROUTE_MIN): number {
  return limit - Math.floor((now.getTime() - requestedAt.getTime()) / 60_000);
}
