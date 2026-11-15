/** M-01 · Telesales' daily calls for the KPI (client, 11 Nov): her own total, and the «By Telesales» lead day. */
import { test } from "node:test";
import assert from "node:assert/strict";

test("a day's count: the larger of what she wrote and what's on the leads", async () => {
  const { dayCalls } = await import("../src/index.ts");
  assert.equal(dayCalls({ entered: 120, logged: 30, telesalesLead: false }), 120);
  assert.equal(dayCalls({ entered: 40, logged: 55, telesalesLead: false }), 55); // never under the logged ones
  assert.equal(dayCalls({ entered: null, logged: 70, telesalesLead: false }), 70); // nothing written
});

test("a «By Telesales» lead makes a short day a full one (100); a day over 100 keeps its number", async () => {
  const { dayCalls, TELESALES_CHANNEL } = await import("../src/index.ts");
  assert.equal(TELESALES_CHANNEL, "By Telesales");
  assert.equal(dayCalls({ entered: 60, logged: 0, telesalesLead: true }), 100);
  assert.equal(dayCalls({ entered: null, logged: 0, telesalesLead: true }), 100);
  assert.equal(dayCalls({ entered: 130, logged: 0, telesalesLead: true }), 130);
});

test("the KPI: the days over the working days so far — 3 working days, one of them empty", async () => {
  const { averageDailyCalls } = await import("../src/index.ts");
  const days = [{ entered: 110, logged: 0, telesalesLead: false }, { entered: 50, logged: 0, telesalesLead: true }];
  assert.equal(averageDailyCalls(days, 3), 70); // (110 + 100 + 0) / 3
  assert.equal(averageDailyCalls(days, 2), 105);
  assert.equal(averageDailyCalls([], 0), 0);
});
