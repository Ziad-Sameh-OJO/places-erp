/** 7.3 · the Visit as the start of a salesperson's day · 1.23 the day's rotation · «شغل من بره / عذر غياب». */
import { test } from "node:test";
import assert from "node:assert/strict";

test("a salesperson's day with a Visit (7.3, 4 Nov meeting): Visit 10:00 + fingerprint 11:40", async () => {
  const { visitDay, pickDayVisit } = await import("../src/index.ts");
  const i = { checkIn: "11:40", partTime: false, partTimeDeductions: false, tiers: null, specialSchedule: false };
  const v = (at: string, outcome: "done" | "not_done" | null = null, postponed = false) => ({ at, outcome, postponed });
  assert.deepEqual([visitDay(i, v("10:00", "done"))!.deduction, visitDay(i, v("10:00", "done"))!.label], [0, "Visit"]); // starts 10:00
  assert.equal(visitDay(i, v("10:00"))!.deduction, 0); // nobody marked it yet: still the Visit
  assert.deepEqual([visitDay(i, v("10:00", "not_done"))!.deduction, visitDay(i, v("10:00", "not_done"))!.lateMinutes], [0.5, 24]); // back to 11:40
  assert.equal(visitDay({ ...i, checkIn: null }, v("10:00", "not_done")), null); // no fingerprint: no start
  assert.equal(visitDay({ ...i, checkIn: "11:50" }, v("11:45"))!.deduction, 0); // up to 12:00: no lateness (M-05 2.1)
  assert.equal(visitDay({ ...i, checkIn: null }, v("13:00", "done"))!.deduction, 1); // after 12 with no check-in: late up to the Visit
  assert.equal(visitDay({ ...i, checkIn: "12:10" }, v("12:10", null, true))!.deduction, 0); // postponed, the TL approved (1.24)
  assert.equal(pickDayVisit([v("15:00"), v("10:00", "not_done")])!.at, "15:00");
  assert.equal(pickDayVisit([]), null);
});

test("today's rotation (1.23): first to start first, nobody yet last; a manual order wins, a newcomer joins the end", async () => {
  const { dayRotation } = await import("../src/index.ts");
  const starts = new Map([["a", "11:20"], ["b", "10:00"]]);
  assert.deepEqual(dayRotation(["a", "b", "c"], starts, null), ["b", "a", "c"]);
  assert.deepEqual(dayRotation(["a", "b", "c"], starts, ["a", "b"]), ["a", "b", "c"]);
  assert.deepEqual(dayRotation(["a", "b", "c"], starts, ["c"]), ["c", "b", "a"]);
});

test("1.23 a pull (1.16 / 1.17) takes the day's order too: who fingerprinted first, a new day from the top, never the one it leaves", async () => {
  const { dayRotation, routingForDay, LeadRouter } = await import("../src/index.ts");
  // saved area order a, b, c; today c fingerprinted 10:50, a 11:05 (late), b had a Visit at 12:30 and isn't in yet
  const today = dayRotation(["a", "b", "c"], new Map([["c", "10:50"], ["a", "11:05"], ["b", "12:30"]]), null);
  assert.deepEqual(today, ["c", "a", "b"]);
  // yesterday's cursor stood after the 2nd: the first pull of a new day starts from the top of today's order
  const router = new LeadRouter(routingForDay({ cursor: { Zayed: 2 }, skipTurns: {}, day: "2026-11-05" }, "2026-11-06"));
  assert.equal(router.next("Zayed", today.filter((x) => x !== "a")), "c"); // pulled from a
  assert.equal(router.next("Zayed", today.filter((x) => x !== "c")), "b"); // the next pull, from c
  // Operations' order by hand for the day wins
  assert.deepEqual(dayRotation(["a", "b", "c"], new Map([["c", "10:50"]]), ["b"]), ["b", "c", "a"]);
});

test("«شغل من بره / عذر غياب»: no balance, before or after the day (7.3)", async () => {
  const { leaveProblem } = await import("../src/index.ts");
  assert.equal(leaveProblem({ type: "عذر غياب", from: "2026-11-01", to: "2026-11-01", today: "2026-11-05", left: 0, hasDocument: false }), null);
  assert.equal(leaveProblem({ type: "شغل من بره", from: "2026-11-06", to: "2026-11-05", today: "2026-11-05", left: 0, hasDocument: false }), "«من» لازم تبقى قبل «لحد»");
});

test("1.24: only whom the rules name approves a postponement (the owner's TL by default); 1.23: the rotation restarts each day", async () => {
  const { ruleHas, DEFAULT_LEAD_RULES, routingForDay } = await import("../src/index.ts");
  const lead = { ownerUserId: "u-sales", ownerTlUserId: "u-tl" };
  assert.equal(ruleHas(DEFAULT_LEAD_RULES.visit.postpone, lead, { id: "u-tl", roles: ["tl"] }), true);
  assert.equal(ruleHas(DEFAULT_LEAD_RULES.visit.postpone, lead, { id: "u-sales", roles: ["sales"] }), false);
  assert.equal(ruleHas(DEFAULT_LEAD_RULES.visit.postpone, lead, { id: "u-ops", roles: ["ops"] }), false);
  assert.equal(ruleHas(DEFAULT_LEAD_RULES.visit.postponeInfo, lead, { id: "u-ops", roles: ["ops"] }), true);
  const s = { cursor: { A: 3 }, skipTurns: { x: 1 }, day: "2026-11-04" };
  assert.deepEqual(routingForDay(s, "2026-11-05"), { cursor: {}, skipTurns: { x: 1 }, day: "2026-11-05" });
  assert.equal(routingForDay(s, "2026-11-04"), s);
  assert.equal(routingForDay(s, "2026-11-03"), s); // a job whose clock is behind never takes the day back
  assert.deepEqual(routingForDay({ cursor: { A: 1 }, skipTurns: {} }, "2026-11-04"), { cursor: {}, skipTurns: {}, day: "2026-11-04" });
});
