import { test } from "node:test";
import assert from "node:assert/strict";
import { bandLabel, calcText, canEnterManual, closeAlert, itemAchievement, levelLabel, metricProblem, nextQuarter, payoutDelta, previousQuarter, quarterLabel, quarterMidpoint, endOfLocalDay, onTimeShare, pct, perWeek, kpiPeriodStart, salesAttendance, timeliness } from "../src/kpi.ts";
import { monthDeduction } from "../src/attendance.ts";

test("11.6 · the client's bands reach payroll: 102% on a 10,000 bonus → +1,500, 65% on a 12,000 salary → −1,800", () => {
  const bonus = payoutDelta(102, { base: "bonus", amount: 10_000_00, monthlySalary: 12_000_00 });
  const cut = payoutDelta(65, { base: "salary", amount: 12_000_00, monthlySalary: 12_000_00 });
  assert.deepEqual([bonus, cut], [1_500_00, -1_800_00]);
  // a reward lowers the month's line below zero (paid on top), a cut adds to the attendance deduction (13,000 → 500 a day)
  assert.equal(monthDeduction({ salary: 12_000_00, attendanceDays: 0, penaltyDays: 0, kpi: bonus }).amount, -1_500_00);
  assert.equal(monthDeduction({ salary: 13_000_00, attendanceDays: 1, penaltyDays: 0, kpi: cut }).amount, 2_300_00);
  assert.equal(monthDeduction({ salary: 2_600_00, attendanceDays: 1, penaltyDays: 0, kpi: -11_800_00 }).amount, 2_600_00); // never above the salary
});

test("11.6 · mid-quarter, and what the closed result triggers", () => {
  assert.equal(quarterMidpoint("2026-Q4"), "2026-11-15");
  assert.equal(quarterMidpoint("2027-Q1"), "2027-02-15");
  assert.equal(previousQuarter("2027-Q1"), "2026-Q4");
  assert.equal(closeAlert(80, null), null);
  assert.equal(closeAlert(65, 40), "plan");
  assert.equal(closeAlert(45, null), "warning");
  assert.equal(closeAlert(45, 60), "warning");
  assert.equal(closeAlert(45, 48), "hr"); // two quarters in a row under 50%
});

test("11.11 · a new quarter follows the last one, across the year", () => {
  assert.equal(nextQuarter("2026-Q4"), "2027-Q1");
  assert.equal(nextQuarter("2027-Q1"), "2027-Q2");
  assert.equal(quarterLabel("2026-Q4"), "Q4 2026");
});

test("11.2 · a hand-in item counts its hand-ins against the times due; the rest count their value", () => {
  // Heba's daily report: 38 of 40 days
  assert.equal(itemAchievement({ method: "report", direction: "at-least", goal: 0, value: null, required: 40, delivered: 38 }), 0.95);
  // Hadeer's calls: 120 of 100 a day is 120% (client 28/10)
  assert.equal(itemAchievement({ method: "system", direction: "at-least", goal: 100, value: 120, required: null, delivered: 0 }), 1.2);
  // a system item the daily job hasn't measured yet counts as 0
  assert.equal(itemAchievement({ method: "system", direction: "at-least", goal: 90, value: null, required: null, delivered: 0 }), 0);
});

test("meeting 4 Nov · a manual item is typed by whoever it names: the follower by default, a person or a role", () => {
  const nancy = { userId: "u21", roles: ["officemgr"], isFollower: false };
  assert.equal(canEnterManual([], { userId: "x", roles: [], isFollower: true }), true);
  assert.equal(canEnterManual(["follower"], nancy), false);
  assert.equal(canEnterManual(["u21"], nancy), true);
  assert.equal(canEnterManual(["officemgr"], nancy), true);
});

test("11.11 · «بيتحسب» says exactly where the number comes from", () => {
  const base = { metric: null, params: {}, report: null, required: null, enteredBy: [], source: "" };
  assert.equal(calcText({ ...base, method: "system", metric: "calls", params: { per: "week", avg: "week" } }, String),
    "عدد المكالمات اللي سجّلها بنفسه على الليدز · آخر 7 أيام · متوسط في الأسبوع");
  assert.equal(calcText({ ...base, method: "system" }, String), "لسه ماتحددش بيتحسب من إيه");
  assert.equal(calcText({ ...base, method: "report", required: 8 }, String), "بيسلّمه بنفسه من الكارت · مطلوب 8 مرة في الربع");
  assert.equal(calcText({ ...base, method: "manual", enteredBy: ["u21"], source: "مراجعة نانسي" }, () => "نانسي"), "بيدخّله نانسي بإيده · من مراجعة نانسي");
});

test("11.11 · only catalog metrics with their own settings are saved", () => {
  assert.equal(metricProblem("calls", { per: "month" }), null);
  assert.equal(metricProblem("nope", {}), "المقياس ده مش في الكتالوج");
  assert.match(metricProblem("calls", { min: 30 }) ?? "", /مالوش إعداد min/);
  assert.equal(metricProblem(null, {}), null);
});

test("11.14 · the watcher reads the tier without money", () => {
  assert.equal(bandLabel(102), "مكافأة 15%");
  assert.equal(levelLabel(102), "محقق");
  assert.equal(levelLabel(80), "محتاج متابعة");
  assert.equal(levelLabel(60), "ضعيف · خطة تحسين");
  assert.equal(levelLabel(40), "تحت الحد");
});

const at = (s: string) => new Date(s);

test("11.5 · the daily job's numbers match the client's examples (M-12 7.1)", () => {
  // Hadeer called 90 leads of 100 within 30 minutes: 90%, her goal → the item is met
  const hadeer = pct(90, 100)!;
  assert.equal(hadeer, 90);
  assert.equal(itemAchievement({ method: "system", direction: "at-least", goal: 90, value: hadeer, required: null, delivered: 0 }), 1);
  // Bayoumi shot 8 of 10 new units within 72 hours: 80% of a 90% goal → 89%
  assert.equal(Math.round(itemAchievement({ method: "system", direction: "at-least", goal: 90, value: pct(8, 10), required: null, delivered: 0 }) * 100), 89);
  assert.equal(pct(0, 0), null);
  assert.equal(pct(0, 0, 100), 100);
});

test("11.5 · an item's period: last 7 days, the Cairo month, the quarter", () => {
  const now = at("2026-11-05T10:00:00Z");
  assert.equal(kpiPeriodStart("week", now, "2026-Q4").toISOString(), "2026-10-29T10:00:00.000Z");
  assert.equal(kpiPeriodStart("month", now, "2026-Q4").toISOString(), "2026-10-31T22:00:00.000Z"); // 1 Nov, Cairo (+2)
  assert.equal(kpiPeriodStart(undefined, now, "2026-Q4").toISOString(), "2026-09-30T21:00:00.000Z"); // 1 Oct, Cairo summer time (+3)
  assert.equal(perWeek(14, at("2026-10-22T10:00:00Z"), now), 7); // 14 in two weeks
  assert.equal(perWeek(3, at("2026-11-04T10:00:00Z"), now), 3); // less than a week counts as one
});

test("11.15 · on time / late / still waiting (not counted)", () => {
  const now = at("2026-11-05T12:00:00Z");
  const due = at("2026-11-05T11:00:00Z");
  assert.equal(timeliness(at("2026-11-05T10:59:00Z"), due, now), "ok");
  assert.equal(timeliness(at("2026-11-05T11:30:00Z"), due, now), "late");
  assert.equal(timeliness(null, due, now), "late"); // waiting past the time
  assert.equal(timeliness(null, at("2026-11-05T13:00:00Z"), now), "waiting");
  // «5 في الميعاد من 8»: the waiting ones aren't counted
  assert.equal(onTimeShare(["ok", "ok", "ok", "ok", "ok", "late", "late", "late", "waiting"]), 62.5);
  assert.equal(onTimeShare(["waiting"]), 100);
  // a lead of 5 Nov 23:30 Cairo is due by Cairo midnight
  assert.equal(endOfLocalDay(at("2026-11-05T21:30:00Z")).toISOString(), "2026-11-05T22:00:00.000Z");
});

test("«الحضور (السيلز)»: half for absence up to 5 days, half for lateness up to 6 hours", () => {
  assert.equal(salesAttendance(0, 0), 100);
  assert.equal(salesAttendance(5, 6), 100);
  assert.equal(salesAttendance(10, 3), 75);
  assert.equal(salesAttendance(5, 12), 75);
});
