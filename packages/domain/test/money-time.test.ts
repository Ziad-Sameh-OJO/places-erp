import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, egp, percentOf } from "../src/money.ts";
import { PLACES_CALENDAR, workingMinutesBetween, isWorkingDay, localDate, dayStart } from "../src/business-time.ts";

// Cairo is UTC+3 in late October 2026 (summer time ends 29/10), so 11:00 Cairo = 08:00Z.
const cairo = (iso: string) => new Date(`${iso}+03:00`);

test("allocate always adds back up to the exact total", () => {
  assert.deepEqual(allocate(egp(100), 3), [3334, 3333, 3333]);
  assert.equal(allocate(egp(100_000), 7).reduce((a, b) => a + b, 0), egp(100_000));
  assert.throws(() => allocate(10.5, 2));
});

test("percentOf rounds to the piaster", () => {
  assert.equal(percentOf(egp(50_000), 30), egp(15_000));
});

test("working minutes count only 11:00–19:00", () => {
  // Sunday 25/10/2026, 10:00 → 13:00 = only 11:00–13:00 counts
  assert.equal(workingMinutesBetween(cairo("2026-10-25T10:00:00"), cairo("2026-10-25T13:00:00")), 120);
  // after hours counts nothing
  assert.equal(workingMinutesBetween(cairo("2026-10-25T19:30:00"), cairo("2026-10-25T23:00:00")), 0);
});

test("Fridays and official holidays are skipped", () => {
  // Thursday 22/10 18:00 → Saturday 24/10 12:00 = Thu 60 + Sat 60 (Friday off)
  assert.equal(workingMinutesBetween(cairo("2026-10-22T18:00:00"), cairo("2026-10-24T12:00:00")), 120);
  const cal = { ...PLACES_CALENDAR, holidays: new Set(["2026-10-24"]) };
  assert.equal(isWorkingDay("2026-10-24", cal), false);
  assert.equal(workingMinutesBetween(cairo("2026-10-22T18:00:00"), cairo("2026-10-24T12:00:00"), cal), 60);
});

test("local date follows Cairo, not UTC", () => {
  assert.equal(localDate(new Date("2026-10-25T22:30:00Z")), "2026-10-26"); // 01:30 Cairo next day
});

test("dayStart: a Cairo day starts at local midnight, summer (+3) or winter (+2)", () => {
  assert.equal(dayStart("2026-07-15").toISOString(), "2026-07-14T21:00:00.000Z");
  assert.equal(dayStart("2026-12-15").toISOString(), "2026-12-14T22:00:00.000Z");
  assert.equal(localDate(dayStart("2026-10-30")), "2026-10-30"); // the day summer time ends
});
