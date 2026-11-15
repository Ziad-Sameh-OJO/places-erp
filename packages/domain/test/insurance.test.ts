/** M-05 · employees' insurance (HR, 15 Nov): the monthly deduction joins the payroll net and its own line (21105). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { INSURANCE_DUE, entryProblem, insuranceDue, payRow, payrollLines } from "../src/index.ts";

test("the net: salary − attendance − insurance − advance; insurance never above what's left of the pay", () => {
  const r = payRow({ salary: 10_000_00, attendance: 500_00, advanceLeft: 2_000_00, advancePlan: null, insurance: 1_100_00 });
  assert.deepEqual(r, { salary: 10_000_00, attendance: 500_00, insurance: 1_100_00, advance: 2_000_00, net: 6_400_00 });
  const small = payRow({ salary: 1_000_00, attendance: 0, advanceLeft: 500_00, advancePlan: null, insurance: 1_100_00 });
  assert.deepEqual(small, { salary: 1_000_00, attendance: 0, insurance: 1_000_00, advance: 0, net: 0 });
});

test("the month's deduction: insured only, from the month it starts", () => {
  assert.equal(insuranceDue({ insured: true, since: "2026-11-10", monthly: 900_00 }, "2026-11"), 900_00);
  assert.equal(insuranceDue({ insured: true, since: "2026-12-01", monthly: 900_00 }, "2026-11"), 0);
  assert.equal(insuranceDue({ insured: true, since: null, monthly: 900_00 }, "2026-11"), 900_00);
  assert.equal(insuranceDue({ insured: false, since: "2026-01-01", monthly: 900_00 }, "2026-11"), 0);
  assert.equal(insuranceDue(undefined, "2026-11"), 0);
});

test("the payroll entry credits the insurance withheld to 21105 and stays balanced", () => {
  const a = payRow({ salary: 10_000_00, attendance: 0, advanceLeft: 0, advancePlan: null, insurance: 1_100_00 });
  const b = payRow({ salary: 8_000_00, attendance: 0, advanceLeft: 0, advancePlan: null });
  const lines = payrollLines([{ ...a, line: "admin" }, { ...b, line: "sales" }], { admin: "5202", sales: "5301", from: "11201", insurance: INSURANCE_DUE });
  assert.equal(entryProblem(lines), null);
  assert.deepEqual(lines.map((l) => [l.accountId, l.debit, l.credit]), [["5202", 10_000_00, 0], ["5301", 8_000_00, 0], ["21105", 0, 1_100_00], ["11201", 0, 16_900_00]]);
});
