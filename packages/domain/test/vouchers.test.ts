/** M-07 · vouchers and the budget, with the numbers from the issues (9.2: 1,000 buffet from the main safe; 9.11: 20,000 CIB → Nancy). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetCrossed, budgetLevel, entryProblem, periodStart, voucherLines, voucherProblem } from "../src/index.ts";

test("a payment of 1,000 on the buffet from the main safe: expense debit, safe credit, balanced (9.2)", () => {
  const lines = voucherLines("pay", { from: "11101", account: "5203", amount: 1_000_00 });
  assert.deepEqual(lines, [{ accountId: "5203", debit: 1_000_00, credit: 0 }, { accountId: "11101", debit: 0, credit: 1_000_00 }]);
  assert.equal(entryProblem(lines), null);
});

test("a transfer of 20,000 from CIB to Nancy's safe: to debit, from credit (9.11)", () => {
  assert.deepEqual(voucherLines("transfer", { from: "11201", to: "11102", amount: 20_000_00 }), [{ accountId: "11102", debit: 20_000_00, credit: 0 }, { accountId: "11201", debit: 0, credit: 20_000_00 }]);
});

test("settling a custody: spent on a line + cash back, credited to the person's custody (9.3)", () => {
  const lines = voucherLines("settle", { account: "13401", expense: "5207", to: "11101", amount: 0, spent: 600_00, returned: 400_00 });
  assert.deepEqual(lines, [{ accountId: "5207", debit: 600_00, credit: 0 }, { accountId: "11101", debit: 400_00, credit: 0 }, { accountId: "13401", debit: 0, credit: 1_000_00 }]);
  assert.equal(entryProblem(lines), null);
});

test("refusals: above the balance, the same safe, a settlement above the custody, nothing (4 Nov)", () => {
  assert.match(voucherProblem("pay", { from: "a", account: "b", amount: 1_500_00 }, { from: 1_000_00, fromName: "خزينة رئيسية" })!, /مش كفاية/);
  assert.equal(voucherProblem("transfer", { from: "a", to: "a", amount: 100 }, { from: 1_000_00 }), "اختار خزنتين مختلفتين");
  assert.match(voucherProblem("settle", { account: "c", to: "a", expense: "e", amount: 0, spent: 900_00, returned: 200_00 }, { custody: 1_000_00 })!, /أكبر من العهدة/);
  assert.equal(voucherProblem("settle", { account: "c", amount: 0 }, { custody: 1_000_00 }), "اكتب اتصرف كام أو رجع كام");
  assert.equal(voucherProblem("pay", { from: "a", account: "b", amount: 1_000_00 }, { from: 1_000_00 }), null);
});

test("budget periods and levels: 80% warns, above 100% is over, a crossing notifies once", () => {
  assert.equal(periodStart("month", "2026-11-04"), "2026-11-01");
  assert.equal(periodStart("quarter", "2026-11-04"), "2026-10-01");
  assert.equal(periodStart("year", "2026-11-04"), "2026-01-01");
  assert.equal(budgetLevel(7_000_00, 10_000_00), "ok");
  assert.equal(budgetLevel(8_000_00, 10_000_00), "warn");
  assert.equal(budgetLevel(10_500_00, 10_000_00), "bad");
  assert.equal(budgetLevel(5_000_00, 0), "");
  assert.equal(budgetCrossed(7_000_00, 8_500_00, 10_000_00), "alert");
  assert.equal(budgetCrossed(8_500_00, 9_000_00, 10_000_00), null);
  assert.equal(budgetCrossed(9_000_00, 11_000_00, 10_000_00), "over");
});
