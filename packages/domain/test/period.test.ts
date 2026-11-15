import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_PERIOD, historicalProblem, periodChoices, periodId, quarterBounds, quarterDays, quarterOfDay } from "../src/period.ts";

test("14.12 · a day's quarter, and a quarter's days (both ends included)", () => {
  assert.equal(quarterOfDay("2026-11-15"), "2026-Q4");
  assert.equal(quarterOfDay("2026-01-01"), "2026-Q1");
  assert.equal(quarterOfDay("2026-06-30"), "2026-Q2");
  assert.equal(periodId(2025, 4), "2025-Q4");
  assert.deepEqual(quarterDays("2025-Q4"), { from: "2025-10-01", to: "2025-12-31" });
  assert.deepEqual(quarterDays("2028-Q1"), { from: "2028-01-01", to: "2028-03-31" }); // a leap year
  assert.deepEqual(quarterDays("2026-Q2"), { from: "2026-04-01", to: "2026-06-30" });
});

test("14.12 · the quarter as Cairo instants [from, to): Q4 ends where the next year's Q1 starts", () => {
  const q4 = quarterBounds("2025-Q4"), q1 = quarterBounds("2026-Q1");
  assert.equal(q4.from.toISOString(), "2025-09-30T21:00:00.000Z"); // Cairo summer time (UTC+3) on 1 Oct 2025
  assert.equal(q4.to.toISOString(), "2025-12-31T22:00:00.000Z");
  assert.equal(q4.to.getTime(), q1.from.getTime());
});

test("14.12 · the choices run from Q4 2025 to two quarters after today, latest first", () => {
  const c = periodChoices(new Date("2026-11-15T10:00:00Z"));
  assert.equal(c[0]!.id, "2027-Q2");
  assert.equal(c[0]!.label, "Q2 2027");
  assert.equal(c.at(-1)!.id, FIRST_PERIOD);
  assert.equal(c.length, 7); // Q4 2025, Q1–Q4 2026, Q1–Q2 2027
  assert.deepEqual(periodChoices(new Date("2026-11-15T10:00:00Z"), -1).map((x) => x.id), ["2026-Q3", "2026-Q2", "2026-Q1", "2025-Q4"]);
});

test("14.12 · figures typed by hand: only a quarter that ended, from Q4 2025", () => {
  const now = new Date("2026-11-15T10:00:00Z");
  assert.equal(historicalProblem("2025-Q4", now), null);
  assert.equal(historicalProblem("2026-Q3", now), null);
  assert.match(historicalProblem("2026-Q4", now)!, /لسه ماخلصش/);
  assert.match(historicalProblem("2027-Q1", now)!, /لسه ماخلصش/);
  assert.match(historicalProblem("2025-Q3", now)!, /Q4 2025/);
});
