/** M-05 · per-person deduction tiers. */
import { test } from "node:test";
import assert from "node:assert/strict";

test("per-person tiers: after the 16-minute grace and in order (M-05 3.1, Q33)", async () => {
  const { tiersProblem, DEFAULT_TIERS } = await import("../src/index.ts");
  assert.equal(tiersProblem(DEFAULT_TIERS), null);
  assert.equal(tiersProblem({ quarterFrom: 31, halfFrom: 61, dayFrom: 121 }), null);
  assert.match(tiersProblem({ quarterFrom: 10, halfFrom: 30, dayFrom: 60 })!, /بعد 16/);
  assert.equal(tiersProblem({ quarterFrom: 40, halfFrom: 30, dayFrom: 60 }), "الربع قبل النص، والنص قبل اليوم");
});

test("fingerprint days: 11:16 on time, 11:18 quarter, 11:45 half, 12:10 a day; Weekly Delay from 11:16 (M-05 3.2)", async () => {
  const { fingerprintDay, minutesAfterStart, normTime, normName, deductionAmount } = await import("../src/index.ts");
  const d = (checkIn: string, extra = {}) => fingerprintDay({ checkIn, partTime: false, partTimeDeductions: false, tiers: null, specialSchedule: false, ...extra });
  assert.equal(minutesAfterStart("11:18"), 18);
  assert.deepEqual([d("11:16").deduction, d("11:16").lateMinutes], [0, 0]);
  assert.deepEqual([d("11:18").deduction, d("11:18").lateMinutes], [0.25, 2]); // «11:18 ← 2 دقيقة»
  assert.equal(d("11:45").deduction, 0.5);
  assert.equal(d("12:10").deduction, 1);
  assert.equal(d("11:45", { tiers: { quarterFrom: 31, halfFrom: 61, dayFrom: 121 } }).deduction, 0.25); // per-person tiers
  assert.deepEqual([d("12:10", { partTime: true }).deduction, d("12:10", { partTime: true }).lateMinutes], [0, 54]); // part-time w/o deductions: still counted in Weekly Delay
  assert.equal(d("12:10", { partTime: true, partTimeDeductions: true }).deduction, 1);
  assert.equal(d("13:00", { specialSchedule: true }).deduction, 0);
  assert.equal(normTime("11.5"), null);
  assert.equal(normTime("9:05"), "09:05");
  assert.equal(normTime("11:18:00"), "11:18");
  assert.equal(normName(" أحمد  أشرف "), normName("احمد اشرف"));
  assert.equal(deductionAmount(12_000_00, 0.25), 11_538); // a quarter day at 12,000 / 26
});

test("penalties: a quarter-day step up to 3 days, counted only once HR approved; the 1-to-1 monthly; the HR action alarm (7.7 · 7.8)", async () => {
  const { penaltyDaysOk, penaltyCounts, oneOnOneDue, actionAlarm } = await import("../src/index.ts");
  assert.ok(penaltyDaysOk(0) && penaltyDaysOk(0.25) && penaltyDaysOk(1) && penaltyDaysOk(3));
  assert.ok(!penaltyDaysOk(0.3) && !penaltyDaysOk(4) && !penaltyDaysOk(-1));
  assert.equal(penaltyCounts("pending"), false);
  assert.equal(penaltyCounts("approved"), true);
  assert.equal(oneOnOneDue("2026-10-25", "2026-11-05"), "due"); // «قعدت معاه 25/10، يبقى الجاية في نوفمبر»
  assert.equal(oneOnOneDue("2026-11-02", "2026-11-05"), "done");
  assert.equal(oneOnOneDue(null, "2026-11-05"), "due");
  assert.equal(actionAlarm("2026-11-05", "2026-11-05", false, false), true);
  assert.equal(actionAlarm("2026-11-06", "2026-11-05", false, false), false);
  assert.equal(actionAlarm("2026-11-04", "2026-11-05", true, false), false);
  assert.equal(actionAlarm("2026-11-04", "2026-11-05", false, true), false);
});

test("the Excuse: 1–2 free, 3–4 half a day, the 5th refused; on the day it replaces «متأخر» (7.4, Q31)", async () => {
  const { excuseNumber, excuseRefused, excuseDeduction, attendanceDay } = await import("../src/index.ts");
  assert.equal(excuseNumber(0), 1);
  assert.deepEqual([1, 2, 3, 4].map(excuseDeduction), [0, 0, 0.5, 0.5]);
  assert.equal(excuseRefused(4), false);
  assert.equal(excuseRefused(5), true);
  const day = attendanceDay({ kind: "excuse", minutesAfterStart: 75, excuseNumberThisMonth: 2 });
  assert.deepEqual([day.deduction, day.lateMinutes, day.label], [0, 59, "Excuse #2"]); // 12:15 would be a full day; Weekly Delay still counts
});

test("the month's deduction for payroll: attendance + approved penalty days at salary ÷ 26, rounded once (7.9)", async () => {
  const { monthDeduction } = await import("../src/index.ts");
  // 13,000 a month = 500 a day; 1¼ days late + a half-day penalty = 1¾ days = 875
  assert.deepEqual(monthDeduction({ salary: 13_000_00, attendanceDays: 1.25, penaltyDays: 0.5 }), { days: 1.75, amount: 875_00 });
  // 12,000: three quarters rounded once (346.15), not three times
  assert.equal(monthDeduction({ salary: 12_000_00, attendanceDays: 0.75, penaltyDays: 0 }).amount, 346_15);
  assert.equal(monthDeduction({ salary: 2_600_00, attendanceDays: 20, penaltyDays: 9 }).amount, 2_600_00); // never above the salary
  assert.deepEqual(monthDeduction({ salary: 10_000_00, attendanceDays: 0, penaltyDays: 0 }), { days: 0, amount: 0 });
});
