import { test } from "node:test";
import assert from "node:assert/strict";
import { monthLock, spreadTotal, yearMonths, yearQuarters } from "../src/target-plan.ts";

test("a month's target: past closed; this month after its 1st needs approval unless you approve; coming months open (11.8)", () => {
  assert.equal(monthLock("2026-10", "2026-11-25", true), "closed");
  assert.equal(monthLock("2026-11", "2026-11-25", false), "approval");
  assert.equal(monthLock("2026-11", "2026-11-25", true), "open");
  assert.equal(monthLock("2026-11", "2026-11-01", false), "open"); // the 1st: still the plan
  assert.equal(monthLock("2026-12", "2026-11-25", false), "open");
});

test("the year's months and quarters", () => {
  assert.equal(yearMonths(2026).length, 12);
  assert.deepEqual(yearQuarters(2026)[3], ["2026-10", "2026-11", "2026-12"]);
});

test("a quarter's total spread over its months: closed months keep theirs, the open ones share the rest, whole units", () => {
  // 300,000 EGP for Q4 with October closed at 80,000: November and December share 220,000
  assert.deepEqual(spreadTotal(30_000_000, [8_000_000, 0, 0], [true, false, false]), [8_000_000, 11_000_000, 11_000_000]);
  assert.deepEqual(spreadTotal(10, [0, 0, 0], [false, false, false]), [4, 3, 3]); // 10 Transactions over three months
  assert.deepEqual(spreadTotal(100, [150, 0, 0], [true, false, false]), [150, 0, 0]); // the closed month already passes it
  assert.deepEqual(spreadTotal(500, [1, 2, 3], [true, true, true]), [1, 2, 3]); // nothing left to change
  const year = spreadTotal(120_000_000, Array(12).fill(0), Array(12).fill(false));
  assert.equal(year.reduce((s, v) => s + v, 0), 120_000_000);
  assert.ok(year.every((v) => v === 10_000_000));
});
