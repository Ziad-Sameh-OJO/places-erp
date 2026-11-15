import { test } from "node:test";
import assert from "node:assert/strict";
import { comparisonWindows, conversionRate, targetPace, teamTone, workingDays } from "../src/dashboard-ahmed.ts";
import { PLACES_CALENDAR } from "../src/business-time.ts";

const EGP = 100; // piasters
const iso = (d: Date) => d.toISOString();
// Monday 16 Nov 2026, 14:30 Cairo (UTC+2)
const now = new Date("2026-11-16T12:30:00Z");

test("today vs yesterday up to the same time", () => {
  const w = comparisonWindows("today", now);
  assert.equal(iso(w.current.from), "2026-11-15T22:00:00.000Z");
  assert.equal(iso(w.current.to), iso(now));
  assert.equal(iso(w.previous.from), "2026-11-14T22:00:00.000Z");
  assert.equal(iso(w.previous.to), "2026-11-15T12:30:00.000Z"); // yesterday 14:30
});

test("the office week (Saturday–Friday) vs last week up to the same point", () => {
  const w = comparisonWindows("week", now);
  assert.equal(iso(w.current.from), "2026-11-13T22:00:00.000Z"); // Saturday 14 Nov
  assert.equal(iso(w.previous.from), "2026-11-06T22:00:00.000Z"); // Saturday 7 Nov
  assert.equal(iso(w.previous.to), "2026-11-09T12:30:00.000Z"); // Monday 9 Nov 14:30
});

test("this month vs last month for as many days; never past the previous one's end", () => {
  const w = comparisonWindows("month", now);
  assert.equal(iso(w.current.from), "2026-10-31T22:00:00.000Z");
  assert.equal(iso(w.previous.from), "2026-09-30T21:00:00.000Z"); // 1 Oct, summer time
  // 31 Dec: November has 30 days, so the previous window stops at 1 Dec
  const end = comparisonWindows("month", new Date("2026-12-31T15:00:00Z"));
  assert.equal(iso(end.previous.to), iso(end.current.from));
});

test("a quarter: the current one so far, an ended one whole, against the quarter before", () => {
  const q4 = comparisonWindows("quarter", now);
  assert.equal(iso(q4.current.to), iso(now));
  assert.equal(q4.previous.to.getTime() - q4.previous.from.getTime(), now.getTime() - q4.current.from.getTime()); // as long
  const q3 = comparisonWindows("quarter", now, PLACES_CALENDAR, "2026-Q3");
  assert.equal(iso(q3.current.to), iso(q4.current.from)); // ended: all of it
  assert.equal(iso(q3.previous.to), iso(q3.current.from)); // Q2 whole too, not running into Q3
  const future = comparisonWindows("quarter", now, PLACES_CALENDAR, "2027-Q1");
  assert.equal(future.current.to.getTime(), future.current.from.getTime()); // nothing yet
});

test("working days: no Fridays, no official holidays", () => {
  assert.equal(workingDays("2026-11-01", "2026-11-30"), 26); // Fridays 6, 13, 20, 27
  assert.equal(workingDays("2026-11-01", "2026-11-30", { ...PLACES_CALENDAR, holidays: new Set(["2026-11-02"]) }), 25);
});

test("the target line: goal × working days gone ÷ working days, and what's needed a day", () => {
  // November: 26 working days, the 16th is the 14th of them (today included); 13 days left counting today
  const p = targetPace({ goal: 2_600_000 * EGP, achieved: 1_000_000 * EGP, from: "2026-11-01", to: "2026-11-30", today: "2026-11-16" });
  assert.equal(p.expected, 1_400_000 * EGP);
  assert.equal(p.perDay, Math.ceil((1_600_000 * EGP) / 13));
  assert.equal(targetPace({ goal: 100, achieved: 120, from: "2026-11-01", to: "2026-11-30", today: "2026-11-16" }).perDay, null); // reached
  assert.deepEqual(targetPace({ goal: 0, achieved: 0, from: "2026-11-01", to: "2026-11-30", today: "2026-11-16" }), { expected: 0, perDay: null });
  const over = targetPace({ goal: 2_600_000 * EGP, achieved: 0, from: "2026-11-01", to: "2026-11-30", today: "2026-12-05" });
  assert.deepEqual(over, { expected: 2_600_000 * EGP, perDay: null }); // the period ended
});

test("conversion to the next stage and the teams' colours", () => {
  assert.equal(conversionRate(40, 10), 25);
  assert.equal(conversionRate(0, 3), null);
  assert.equal(teamTone(100), "ok");
  assert.equal(teamTone(70), "warn");
  assert.equal(teamTone(69.9), "bad");
  assert.equal(teamTone(null), "bad");
});
