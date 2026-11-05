import { test } from "node:test";
import assert from "node:assert/strict";
import { bandLabel, calcText, canEnterManual, closeAlert, itemAchievement, levelLabel, metricProblem, nextQuarter, payoutDelta, previousQuarter, quarterLabel, quarterMidpoint } from "../src/kpi.ts";
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
