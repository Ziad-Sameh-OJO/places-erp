import { test } from "node:test";
import assert from "node:assert/strict";
import { CALL_TARGETS, callGoal, callPeriodStart, firstCallOnTime } from "../src/calls.ts";

const cairo = (iso: string) => new Date(`${iso}+02:00`);

test("first call within 30 minutes of arrival (KPI: Hadeer «أول اتصال بالليد خلال 30 دقيقة»)", () => {
  const arrived = cairo("2026-11-04T11:00:00");
  assert.equal(firstCallOnTime(arrived, cairo("2026-11-04T11:30:00")), true); // exactly 30 counts
  assert.equal(firstCallOnTime(arrived, cairo("2026-11-04T11:31:00")), false);
  assert.equal(firstCallOnTime(arrived, null), null); // nobody called yet
  // the campaign's WhatsApp time can be the arrival (requirements «وقت وصول الليد»): same rule
  assert.equal(firstCallOnTime(cairo("2026-11-04T10:50:00"), cairo("2026-11-04T11:10:00")), true);
});

test("call goals: Telesales 100 a day, sales and TLs 50 a week, others none", () => {
  assert.deepEqual(callGoal(["telesales"]), { period: "day", target: 100 });
  assert.deepEqual(callGoal(["sales"]), { period: "week", target: 50 });
  assert.deepEqual(callGoal(["tl", "sales"]), { period: "week", target: 50 });
  assert.equal(callGoal(["ops"]), null);
  assert.equal(CALL_TARGETS.firstCallMinutes, 30);
});

test("the day starts at Cairo midnight; the week is the last 7 days", () => {
  const now = new Date("2026-11-04T21:30:00Z"); // 23:30 in Cairo
  assert.equal(callPeriodStart({ period: "day", target: 100 }, now).toISOString(), "2026-11-03T22:00:00.000Z");
  assert.equal(callPeriodStart({ period: "week", target: 50 }, now).toISOString(), "2026-10-28T21:30:00.000Z");
});
