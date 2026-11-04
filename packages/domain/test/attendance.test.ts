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
