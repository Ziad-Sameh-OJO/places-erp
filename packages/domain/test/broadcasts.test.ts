import { test } from "node:test";
import assert from "node:assert/strict";
import { broadcastsThisWeek, weekOf } from "../src/broadcasts.ts";

test("the office week is Saturday to Friday, in Cairo", () => {
  assert.deepEqual(weekOf(new Date("2026-11-05T10:00:00Z")), { from: "2026-10-31", to: "2026-11-06" }); // Thu 5 Nov
  assert.deepEqual(weekOf(new Date("2026-11-07T08:00:00Z")), { from: "2026-11-07", to: "2026-11-13" }); // Sat 7 Nov
  assert.deepEqual(weekOf(new Date("2026-11-06T22:30:00Z")), { from: "2026-11-07", to: "2026-11-13" }); // Fri 22:30Z = Sat 00:30 Cairo
});

test("M-12 Rahma 4: two Broadcasts a week with Hot Inventory — one without units or not approved doesn't count", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const b = (iso: string, hotUnits = 3, approved = true) => ({ createdAt: new Date(iso), approved, hotUnits });
  assert.equal(broadcastsThisWeek([b("2026-11-01T09:00:00Z"), b("2026-11-04T09:00:00Z")], now), 2); // Sunday and Wednesday
  assert.equal(broadcastsThisWeek([b("2026-11-01T09:00:00Z", 0), b("2026-11-04T09:00:00Z", 3, false)], now), 0);
  assert.equal(broadcastsThisWeek([b("2026-10-28T09:00:00Z")], now), 0); // last week
});
