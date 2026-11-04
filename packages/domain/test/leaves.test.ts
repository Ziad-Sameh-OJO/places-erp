/** M-05 · leaves: days, balances, sick after return with a document, the 24 / 48-hour chase (3.2: 21 days, 5 used → 16). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { daysWithin, leaveChase, leaveDays, leaveProblem } from "../src/index.ts";

test("days = to − from + 1; the balance left (21 − 5 = 16)", () => {
  assert.equal(leaveDays("2026-11-10", "2026-11-14"), 5);
  assert.equal(leaveDays("2026-11-10", "2026-11-10"), 1);
  const ask = { type: "سنوية", from: "2026-11-10", to: "2026-11-26", today: "2026-11-05", left: 16, hasDocument: false };
  assert.equal(leaveProblem(ask), "الرصيد 16 يوم بس"); // 17 days
  assert.equal(leaveProblem({ ...ask, to: "2026-11-25" }), null);
});

test("annual before the leave; sick after return with a document", () => {
  assert.equal(leaveProblem({ type: "سنوية", from: "2026-11-01", to: "2026-11-02", today: "2026-11-05", left: 21, hasDocument: false }), "الطلب بيتعمل قبل الإجازة");
  assert.equal(leaveProblem({ type: "مرضية", from: "2026-11-01", to: "2026-11-02", today: "2026-11-05", left: 15, hasDocument: false }), "الإجازة مرضية بتتسجّل بمستند");
  assert.equal(leaveProblem({ type: "مرضية", from: "2026-11-01", to: "2026-11-02", today: "2026-11-05", left: 15, hasDocument: true }), null);
  assert.equal(leaveProblem({ type: "سنوية", from: "2026-11-09", to: "2026-11-08", today: "2026-11-05", left: 21, hasDocument: false }), "«من» لازم تبقى قبل «لحد»");
});

test("chase: remind at 24 hours, escalate at 48, each once", () => {
  const sent = new Date("2026-11-04T10:00:00Z");
  assert.equal(leaveChase(sent, new Date("2026-11-05T09:00:00Z"), { reminded: false, escalated: false }), null);
  assert.equal(leaveChase(sent, new Date("2026-11-05T10:00:00Z"), { reminded: false, escalated: false }), "remind");
  assert.equal(leaveChase(sent, new Date("2026-11-05T20:00:00Z"), { reminded: true, escalated: false }), null);
  assert.equal(leaveChase(sent, new Date("2026-11-06T10:00:00Z"), { reminded: true, escalated: false }), "escalate");
  assert.equal(leaveChase(sent, new Date("2026-11-07T10:00:00Z"), { reminded: true, escalated: true }), null);
});

test("the monthly report counts only the month's days", () => {
  assert.equal(daysWithin("2026-10-29", "2026-11-03", "2026-11-01", "2026-11-30"), 3);
  assert.equal(daysWithin("2026-12-01", "2026-12-03", "2026-11-01", "2026-11-30"), 0);
});
