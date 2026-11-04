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
