import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LEAD_RULES as R, calendarOf, durationText, holidayDays, leadRulesProblem, slaRulesOf } from "../src/lead-rules.ts";
import { PLACES_CALENDAR, workingMinutesBetween } from "../src/business-time.ts";
import { leadSla } from "../src/leads.ts";

const cairo = (iso: string) => new Date(`${iso}+03:00`);

test("the defaults are the requirements' (M-01 Q4, Q5) and the demo's", () => {
  assert.deepEqual(slaRulesOf(R), { warnAfter: 150, pullAfter: 180, holidayWarnAfter: 1320, holidayPullAfter: 1440 });
  assert.deepEqual(R.work, { from: 660, to: 1140, off: [5] }); // 11:00–19:00, Friday off
  assert.equal(R.noAnswer.hours, 24);
  assert.equal(R.noAnswer.remindH, 4);
  assert.equal(R.noAnswer.toTelesalesAt, 3);
  assert.equal(R.draft.days, 7);
  assert.equal(R.draft.holdDays, 14);
  assert.equal(leadRulesProblem(R), null);
});

test("bad combinations are refused, like the demo (warning after pulling, start after end, no working day…)", () => {
  assert.match(leadRulesProblem({ ...R, sla: { ...R.sla, warnMin: 180, pullMin: 180 } })!, /التنبيه/);
  assert.match(leadRulesProblem({ ...R, sla: { ...R.sla, holWarnMin: 1500 } })!, /التنبيه/);
  assert.match(leadRulesProblem({ ...R, work: { ...R.work, from: 1140, to: 660 } })!, /البداية/);
  assert.match(leadRulesProblem({ ...R, work: { ...R.work, off: [0, 1, 2, 3, 4, 5, 6] } })!, /يوم شغل/);
  assert.match(leadRulesProblem({ ...R, noAnswer: { ...R.noAnswer, remindH: 30 } })!, /تنبيه المكالمة/);
  assert.match(leadRulesProblem({ ...R, draft: { ...R.draft, holdDays: 3 } })!, /Hold/);
});

test("pull after 2 hours: a lead is pulled 2 working hours after it reached the salesperson (1.29 «يخلص لما»)", () => {
  const two = slaRulesOf({ ...R, sla: { ...R.sla, warnMin: 90, pullMin: 120 } });
  const at = cairo("2026-10-25T11:00:00"); // Sunday
  const lead = { stage: "Fresh" as const, touched: false, ownedByTelesales: false, assignedAt: at };
  assert.equal(leadSla(lead, cairo("2026-10-25T12:59:00"), { holidayMode: false, rules: two })?.level, "warn");
  assert.equal(leadSla(lead, cairo("2026-10-25T13:00:00"), { holidayMode: false, rules: two })?.level, "pull");
});

test("the SLA counts in the rules' hours and weekdays off", () => {
  const cal = calendarOf({ ...R, work: { from: 10 * 60, to: 18 * 60, off: [5, 6] } }, PLACES_CALENDAR);
  // Saturday is now off; Sunday counts from 10:00
  assert.equal(workingMinutesBetween(cairo("2026-10-24T10:00:00"), cairo("2026-10-25T11:00:00"), cal), 60);
  assert.equal(workingMinutesBetween(cairo("2026-10-24T10:00:00"), cairo("2026-10-25T11:00:00")), 480); // the default: Saturday 11–19 counts
});

test("holidays are ranges «من … لحد …»: every day in between is a holiday", () => {
  const days = holidayDays([{ from: "2027-03-09", to: "2027-03-12" }, { from: "2027-01-07", to: "2027-01-07" }]);
  assert.deepEqual([...days].sort(), ["2027-01-07", "2027-03-09", "2027-03-10", "2027-03-11", "2027-03-12"]);
  assert.equal(holidayDays([{ from: "2027-01-01", to: "2030-01-01" }]).size, 367); // a typo is cut to a year
  assert.equal(holidayDays([{ from: "2027-02-01", to: "2027-01-01" }]).size, 0);
});

test("the sentences' durations, word for word like the demo's A.dur", () => {
  assert.equal(durationText(150), "ساعتين و30 دقيقة");
  assert.equal(durationText(180), "3 ساعات");
  assert.equal(durationText(1320), "22 ساعة");
  assert.equal(durationText(1440), "24 ساعة");
  assert.equal(durationText(45), "45 دقيقة");
  assert.equal(durationText(75), "ساعة و15 دقيقة");
  assert.equal(durationText(120), "ساعتين");
});

test("a rule's people for one lead: «owner» is its salesperson, «ownerTl» their Team Leader; roles and people as they are", async () => {
  const { ruleRecipients } = await import("../src/lead-rules.ts");
  // the demo's «ليد جديد اتوزع»: the salesperson and the Team Leaders
  assert.deepEqual(ruleRecipients(R.newLead, { ownerUserId: "u-mohsen", ownerTlUserId: "u-abdallah" }), ["u-mohsen", "tl"]);
  assert.deepEqual(ruleRecipients({ to: ["ownerTl", "owner", "ops", "u-heba"], ch: ["app"] }, { ownerUserId: "u-mohsen", ownerTlUserId: "u-abdallah" }), ["u-abdallah", "u-mohsen", "ops", "u-heba"]);
  // nobody assigned yet / no Team Leader: those simply drop out
  assert.deepEqual(ruleRecipients({ to: ["owner", "ownerTl", "ops"], ch: ["app"] }, { ownerUserId: null, ownerTlUserId: null }), ["ops"]);
  // the salesperson also named as a person: once
  assert.deepEqual(ruleRecipients({ to: ["owner", "u-mohsen"], ch: ["app"] }, { ownerUserId: "u-mohsen", ownerTlUserId: null }), ["u-mohsen"]);
});

/** Cairo winter time (+02:00): daylight saving ended on 30 Oct 2026. */
const winter = (iso: string) => new Date(`${iso}+02:00`);

test("1.16 the SLA job's step (M-01 Q4): 2h30 working → warn once, 3h → pull; after hours it waits for the morning", async () => {
  const { slaStep } = await import("../src/lead-rules.ts");
  const none = new Set<string>();
  const at = cairo("2026-10-25T11:00:00"); // a Sunday
  const step = (now: string, warned = false) => slaStep({ assignedAt: at, warned }, cairo(now), R, none);
  assert.equal(step("2026-10-25T13:29:00"), null);
  assert.equal(step("2026-10-25T13:30:00"), "warn");
  assert.equal(step("2026-10-25T13:45:00", true), null); // warned already: never twice
  assert.equal(step("2026-10-25T14:00:00"), "pull");
  assert.equal(step("2026-10-25T14:00:00", true), "pull");
  // landed Thursday 18:00: one hour that day, Friday off, the rest from 11:00 on Saturday
  const thu = cairo("2026-10-29T18:00:00");
  assert.equal(slaStep({ assignedAt: thu, warned: false }, winter("2026-10-31T12:29:00"), R, none), null);
  assert.equal(slaStep({ assignedAt: thu, warned: false }, winter("2026-10-31T12:30:00"), R, none), "warn");
  assert.equal(slaStep({ assignedAt: thu, warned: false }, winter("2026-10-31T13:00:00"), R, none), "pull");
});

test("1.16 on an official holiday (a range, like Eid) the clock is wall-clock: warn at 22h, pull at 24h", async () => {
  const { slaStep } = await import("../src/lead-rules.ts");
  const eid = holidayDays([{ from: "2026-11-01", to: "2026-11-03" }]);
  const at = winter("2026-11-01T10:00:00");
  assert.equal(slaStep({ assignedAt: at, warned: false }, winter("2026-11-01T13:00:00"), R, eid), null); // a working day would pull at 3h
  assert.equal(slaStep({ assignedAt: at, warned: false }, winter("2026-11-02T07:59:00"), R, eid), null);
  assert.equal(slaStep({ assignedAt: at, warned: false }, winter("2026-11-02T08:00:00"), R, eid), "warn");
  assert.equal(slaStep({ assignedAt: at, warned: false }, winter("2026-11-02T10:00:00"), R, eid), "pull");
});

test("1.16 the times, hours and the switch come from «قواعد الليدز», not the code", async () => {
  const { slaStep } = await import("../src/lead-rules.ts");
  const at = cairo("2026-10-25T11:00:00"), none = new Set<string>();
  const quick = { ...R, sla: { ...R.sla, warnMin: 30, pullMin: 60 } };
  assert.equal(slaStep({ assignedAt: at, warned: false }, cairo("2026-10-25T11:30:00"), quick, none), "warn");
  assert.equal(slaStep({ assignedAt: at, warned: false }, cairo("2026-10-25T12:00:00"), quick, none), "pull");
  assert.equal(slaStep({ assignedAt: at, warned: false }, cairo("2026-10-25T18:00:00"), { ...R, sla: { ...R.sla, on: false } }, none), null);
  // 09:00–17:00 with Friday and Saturday off: Thursday 16:00 → 1 hour, then Sunday 09:00 → 11:00 makes 3
  const early = { ...R, work: { from: 9 * 60, to: 17 * 60, off: [5, 6] } };
  const thu = cairo("2026-10-29T16:00:00");
  assert.equal(slaStep({ assignedAt: thu, warned: false }, winter("2026-11-01T10:29:00"), early, none), null);
  assert.equal(slaStep({ assignedAt: thu, warned: false }, winter("2026-11-01T10:30:00"), early, none), "warn");
  assert.equal(slaStep({ assignedAt: thu, warned: false }, winter("2026-11-01T11:00:00"), early, none), "pull");
});

test("saved rules over the defaults: a rule saved before a new one existed gets the new one's default", async () => {
  const { withRuleDefaults } = await import("../src/lead-rules.ts");
  const r = withRuleDefaults({ sla: { warnMin: 60 }, work: { off: [5, 6] } });
  assert.equal(r.sla.warnMin, 60);
  assert.equal(r.sla.pullMin, 180);
  assert.deepEqual(r.work.off, [5, 6]);
  assert.deepEqual(r.sla.warn, R.sla.warn);
  assert.deepEqual(withRuleDefaults(null), R);
});

test("1.17 No Answer (M-01 Q5): 24 hours from the salesperson's own mark → the next one; the 3rd rotation → Telesales", async () => {
  const { noAnswerStep } = await import("../src/lead-rules.ts");
  const marked = winter("2026-11-05T15:00:00"); // a Thursday afternoon
  const lead = { assignedToId: "e-mohsen", naMarkedById: "e-mohsen", naMarkedAt: marked, rotation: 1 };
  assert.equal(noAnswerStep(lead, winter("2026-11-06T14:59:00"), R), null);
  // wall-clock: it moves on Friday (a day off) all the same — «حتى لو الـ 24 ساعة خلصت في إجازة»
  assert.equal(noAnswerStep(lead, winter("2026-11-06T15:00:00"), R), "next");
  // with the second salesperson, who marked it too: the 3rd rotation is Telesales
  assert.equal(noAnswerStep({ ...lead, rotation: 2 }, winter("2026-11-06T15:00:00"), R), "telesales");
  // the next salesperson hasn't marked it (or someone else did): it doesn't move; the SLA takes over
  assert.equal(noAnswerStep({ ...lead, naMarkedById: null, naMarkedAt: null }, winter("2026-11-09T15:00:00"), R), null);
  assert.equal(noAnswerStep({ ...lead, naMarkedById: "e-heba" }, winter("2026-11-09T15:00:00"), R), null);
  assert.equal(noAnswerStep({ ...lead, assignedToId: "e-eid" }, winter("2026-11-09T15:00:00"), R), null);
});

test("1.17 the hours and the Telesales rotation come from «قواعد الليدز»", async () => {
  const { noAnswerStep } = await import("../src/lead-rules.ts");
  const lead = { assignedToId: "e-1", naMarkedById: "e-1", naMarkedAt: winter("2026-11-05T15:00:00"), rotation: 2 };
  const rules = { ...R, noAnswer: { ...R.noAnswer, hours: 12, toTelesalesAt: 4 } };
  assert.equal(noAnswerStep(lead, winter("2026-11-06T02:59:00"), rules), null);
  assert.equal(noAnswerStep(lead, winter("2026-11-06T03:00:00"), rules), "next");
  assert.equal(noAnswerStep({ ...lead, rotation: 3 }, winter("2026-11-06T03:00:00"), rules), "telesales");
});

test("1.17 the New Lead clock: 30 minutes by default (Heba's KPI item), negative once late", async () => {
  const { newLeadMinutesLeft, NEW_LEAD_ROUTE_MIN } = await import("../src/lead-rules.ts");
  const at = winter("2026-11-05T12:00:00");
  assert.equal(NEW_LEAD_ROUTE_MIN, 30);
  assert.equal(newLeadMinutesLeft(at, winter("2026-11-05T12:00:30")), 30);
  assert.equal(newLeadMinutesLeft(at, winter("2026-11-05T12:21:00")), 9);
  assert.equal(newLeadMinutesLeft(at, winter("2026-11-05T12:45:00")), -15);
});

test("1.18 the No Answer Alarm (M-01 Q5): every 4 working hours from the mark, a logged call or the last Alarm", async () => {
  const { noAnswerReminderDue } = await import("../src/lead-rules.ts");
  const none = new Set<string>();
  const marked = winter("2026-11-08T11:00:00"); // a Sunday
  const due = (now: string, more: { lastCallAt?: Date; remindedAt?: Date } = {}) =>
    noAnswerReminderDue({ naMarkedAt: marked, lastCallAt: more.lastCallAt ?? null, remindedAt: more.remindedAt ?? null }, winter(now), R, none);
  assert.equal(due("2026-11-08T14:59:00"), false);
  assert.equal(due("2026-11-08T15:00:00"), true);
  // the Alarm went at 15:00: the next one 4 working hours later, 19:00
  assert.equal(due("2026-11-08T18:59:00", { remindedAt: winter("2026-11-08T15:00:00") }), false);
  assert.equal(due("2026-11-08T19:00:00", { remindedAt: winter("2026-11-08T15:00:00") }), true);
  // a call at 13:00 restarts the clock: 17:00
  assert.equal(due("2026-11-08T16:59:00", { lastCallAt: winter("2026-11-08T13:00:00") }), false);
  assert.equal(due("2026-11-08T17:00:00", { lastCallAt: winter("2026-11-08T13:00:00") }), true);
  // marked Thursday 17:00: 2 hours that day, Friday off, Saturday 13:00 makes 4
  const thu = { naMarkedAt: winter("2026-11-05T17:00:00"), lastCallAt: null, remindedAt: null };
  assert.equal(noAnswerReminderDue(thu, winter("2026-11-07T12:59:00"), R, none), false);
  assert.equal(noAnswerReminderDue(thu, winter("2026-11-07T13:00:00"), R, none), true);
  // an official holiday doesn't count, and the hours come from the rules
  assert.equal(noAnswerReminderDue(thu, winter("2026-11-07T13:00:00"), R, holidayDays([{ from: "2026-11-07", to: "2026-11-07" }])), false);
  assert.equal(noAnswerReminderDue(thu, winter("2026-11-07T12:00:00"), { ...R, noAnswer: { ...R.noAnswer, remindH: 3 } }, none), true);
  assert.equal(noAnswerReminderDue({ naMarkedAt: null, lastCallAt: null, remindedAt: null }, winter("2026-11-20T12:00:00"), R, none), false);
});
