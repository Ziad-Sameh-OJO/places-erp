import { test } from "node:test";
import assert from "node:assert/strict";
import { assetsReviewedThisMonth } from "../src/office-assets.ts";

const now = new Date("2026-11-04T10:00:00Z");

test("M-08 3.1 · the assets register counts as reviewed only in the month of its last review", () => {
  assert.equal(assetsReviewedThisMonth(new Date("2026-11-02T09:00:00Z"), now), true);
  // the demo's «اتراجع» 12 days back, on 23 Oct: last month, so it isn't this month's review
  assert.equal(assetsReviewedThisMonth(new Date("2026-10-23T09:00:00Z"), now), false);
  assert.equal(assetsReviewedThisMonth(null, now), false);
});

test("M-08 3.1 · the month is Cairo's: 00:30 on 1 Nov in Cairo (31 Oct in UTC) is November's review", () => {
  assert.equal(assetsReviewedThisMonth(new Date("2026-10-31T22:30:00Z"), now), true);
  // a year ago's November is not this November
  assert.equal(assetsReviewedThisMonth(new Date("2025-11-04T10:00:00Z"), now), false);
});
