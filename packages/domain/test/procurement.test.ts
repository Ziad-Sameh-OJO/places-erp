import { test } from "node:test";
import assert from "node:assert/strict";
import { egp } from "../src/money.ts";
import { approvalOverdue, approvalProblem, attachmentProblem, overBudget } from "../src/procurement.ts";

const nancy = { id: "nancy", management: false, aboveLimit: false };
const safwat = { id: "safwat", management: true, aboveLimit: true };
const accountant = { id: "ashraf", management: false, aboveLimit: true };
const laptop = { amount: egp(30_000), createdById: "mokhtar", budgetLeft: null };

test("M-08 7.1 · Mokhtar's 30,000 laptop: any approver can release it, Mokhtar himself can't (4.1)", () => {
  assert.equal(approvalProblem(laptop, nancy), null);
  assert.match(approvalProblem(laptop, { ...safwat, id: "mokhtar" })!, /طلب انت اللي عامله/);
});

test("M-08 Q44 · above 50,000 only Ahmed or Safwat; exactly 50,000 is still anyone's", () => {
  assert.equal(approvalProblem({ ...laptop, amount: egp(50_000) }, nancy), null);
  const big = { ...laptop, amount: egp(50_000.01) };
  assert.match(approvalProblem(big, nancy)!, /لأحمد أو صفوت/);
  assert.equal(approvalProblem(big, accountant), null);
});

test("M-08 Q45 · over the line's budget left only management; 7.1: 100,000 budget with 65,000 spent leaves 35,000", () => {
  const left = egp(100_000) - egp(65_000);
  assert.equal(left, egp(35_000));
  assert.equal(overBudget({ amount: egp(35_000), budgetLeft: left }), false);
  const over = { ...laptop, amount: egp(36_000), budgetLeft: left };
  assert.match(approvalProblem(over, accountant)!, /موافقة الإدارة/);
  assert.equal(approvalProblem(over, safwat), null);
  assert.equal(overBudget({ amount: egp(1), budgetLeft: null }), false); // no budget on the line: nothing to cross
});

test("M-08 0.9 · above 10,000 a receipt or two quotes are required", () => {
  assert.equal(attachmentProblem(egp(10_000), 0), null);
  assert.match(attachmentProblem(egp(10_001), 0)!, /إيصال أو عرضين أسعار/);
  assert.equal(attachmentProblem(egp(10_001), 1), null);
});

test("M-08 2.4 · the approver is reminded after one working day, Friday not counted", () => {
  // Thursday 5 Nov 2026 15:00 Cairo (13:00Z): 4h left that day, Friday off, 4h more on Saturday by 15:00
  const sent = new Date("2026-11-05T13:00:00Z");
  assert.equal(approvalOverdue(sent, new Date("2026-11-06T16:00:00Z")), false); // Friday
  assert.equal(approvalOverdue(sent, new Date("2026-11-07T12:59:00Z")), false); // Sat 14:59
  assert.equal(approvalOverdue(sent, new Date("2026-11-07T13:00:00Z")), true); // Sat 15:00
});
