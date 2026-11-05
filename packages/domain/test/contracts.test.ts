import { test } from "node:test";
import assert from "node:assert/strict";
import { egp } from "../src/money.ts";
import { agingBuckets, addMonths, contractProblem, endingSoon, installmentPlan, installmentState, nextYearValue, renewalAlert } from "../src/contracts.ts";

test("M-11 2.4 · 7.1: renewal alerts at 90, 60 and 30 days, each once; a late look sends only the nearest", () => {
  assert.equal(renewalAlert("2027-02-04", "2026-11-05", []), null); // 91 days left
  assert.deepEqual(renewalAlert("2027-02-03", "2026-11-05", []), { days: 90, mark: [90] });
  assert.equal(renewalAlert("2027-02-03", "2026-11-05", [90]), null); // already told
  assert.deepEqual(renewalAlert("2027-01-04", "2026-11-05", [90]), { days: 60, mark: [90, 60] });
  assert.deepEqual(renewalAlert("2026-12-01", "2026-11-05", []), { days: 30, mark: [90, 60, 30] }); // uploaded late: one alert
  assert.equal(renewalAlert("2026-11-04", "2026-11-05", []), null); // over
});

test("M-11 3.2: installment = value ÷ count, one every n months, adds back up to the value", () => {
  const plan = installmentPlan(egp(100_000), "2026-11-01", 3, 4);
  assert.deepEqual(plan.map((x) => x.dueOn), ["2026-11-01", "2027-03-01", "2027-07-01"]);
  assert.deepEqual(plan.map((x) => x.amount), [egp(33_333.34), egp(33_333.33), egp(33_333.33)]);
  assert.equal(plan.reduce((s, x) => s + x.amount, 0), egp(100_000));
});

test("months: the 31st falls on the month's last day", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-12-15", 3), "2027-03-15");
});

test("contract checks: dates, value, a custom table that adds up", () => {
  const ok = { value: egp(120_000), startsOn: "2026-11-01", endsOn: "2027-10-31", escalation: 10, plan: installmentPlan(egp(120_000), "2026-11-01", 12, 1) };
  assert.equal(contractProblem(ok), null);
  assert.equal(contractProblem({ ...ok, endsOn: "2026-10-01" }), "نهاية العقد لازم تبقى بعد بدايته");
  assert.equal(contractProblem({ ...ok, plan: [{ dueOn: "2026-11-01", amount: egp(100_000) }] }), "مجموع الأقساط لازم يساوي قيمة العقد");
  assert.equal(contractProblem({ ...ok, plan: [{ dueOn: "2028-01-01", amount: egp(120_000) }] }), "ميعاد القسط لازم يبقى جوه مدة العقد");
  assert.equal(contractProblem({ ...ok, value: 0 }), "قيمة العقد لازم تبقى أكبر من صفر");
});

test("M-11 3.2: next year's rent with a 10% yearly increase", () => {
  assert.equal(nextYearValue(egp(120_000), 10), egp(132_000));
  assert.equal(nextYearValue(egp(120_000), 0), egp(120_000));
});

test("M-11 3.3: «قرّب يخلص» at 90 days or less, active contracts only", () => {
  assert.equal(endingSoon("Active", "2027-02-03", "2026-11-05"), true); // 90 days
  assert.equal(endingSoon("Active", "2027-02-04", "2026-11-05"), false); // 91
  assert.equal(endingSoon("Active", "2026-11-04", "2026-11-05"), false); // already over
  assert.equal(endingSoon("Terminated", "2026-12-01", "2026-11-05"), false);
});

test("installment states: paid, partial (Partially Paid), late, not due yet", () => {
  const i = { dueOn: "2026-11-01", amount: egp(10_000) };
  assert.equal(installmentState({ ...i, paid: egp(10_000) }, "2026-11-05"), "paid");
  assert.equal(installmentState({ ...i, paid: egp(4_000) }, "2026-11-05"), "partial");
  assert.equal(installmentState({ ...i, paid: 0 }, "2026-11-05"), "late");
  assert.equal(installmentState({ ...i, paid: 0 }, "2026-10-30"), "due");
});

test("M-11 6.1 Aging: what is owed on late installments, by 0–30 / 31–60 / 61–90 / +90 days late", () => {
  const today = "2026-11-05";
  const lines = [
    { dueOn: "2026-10-20", amount: egp(10_000), paid: egp(4_000) }, // 16 days, 6,000 left
    { dueOn: "2026-09-01", amount: egp(10_000), paid: 0 }, // 65 days
    { dueOn: "2026-06-01", amount: egp(10_000), paid: egp(10_000) }, // paid: nothing owed
    { dueOn: "2026-05-01", amount: egp(5_000), paid: 0 }, // 188 days
    { dueOn: "2026-11-05", amount: egp(10_000), paid: 0 }, // due today: not late yet
  ];
  assert.deepEqual(agingBuckets(lines, today), [egp(6_000), 0, egp(10_000), egp(5_000)]);
});
