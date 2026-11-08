import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldAccess, fieldRuleProblem } from "../src/fields.ts";

test("finance: a hidden «المبلغ» takes every balance and total with it; the number, date and account stay", () => {
  const a = fieldAccess({ finance: { amount: "hide", memo: "read" } });
  for (const k of ["amount", "balance", "debit", "credit", "spent", "left", "net", "salary", "value"]) assert.ok(a.hidden("finance").has(k), k);
  assert.ok(!a.hidden("finance").has("memo"));
  assert.ok(a.fixed("finance").has("memo"));
  assert.equal(fieldRuleProblem("finance", "account", "hide", false), "«الحساب» لازم يفضل ظاهر");
  assert.equal(fieldRuleProblem("finance", "date", "read", false), "«التاريخ» لازم يفضل ظاهر");
  // a voucher can't be saved without an amount: not hideable from a role that records them
  assert.match(fieldRuleProblem("finance", "amount", "hide", true) ?? "", /إجباري/);
  assert.equal(fieldRuleProblem("finance", "amount", "hide", false), null);
});

test("procurement: a hidden «المبلغ» takes the line's budget figures; the item and status stay", () => {
  const a = fieldAccess({ procurement: { amount: "hide", vendor: "hide" } });
  for (const k of ["amount", "budgetLeft", "overBudget", "spent", "vendor"]) assert.ok(a.hidden("procurement").has(k), k);
  assert.equal(fieldRuleProblem("procurement", "item", "hide", false), "«الحاجة» لازم يفضل ظاهر");
  assert.match(fieldRuleProblem("procurement", "account", "hide", true) ?? "", /إجباري/);
  assert.equal(fieldRuleProblem("procurement", "vendor", "hide", true), null);
});
