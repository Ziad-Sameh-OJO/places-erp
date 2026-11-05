import { test } from "node:test";
import assert from "node:assert/strict";
import { egp } from "../src/money.ts";
import { attendanceDay } from "../src/attendance.ts";
import { achievement, cardScore, payoutDelta, bandOf } from "../src/kpi.ts";
import { idealEmployee } from "../src/ideal-employee.ts";
import { effectiveGrants } from "../src/permissions.ts";

test("attendance tiers from the requirements (work starts 11:00)", () => {
  const at = (m: number) => attendanceDay({ kind: "checkin", minutesAfterStart: m });
  assert.equal(at(10).deduction, 0);    // 11:10 on time
  assert.equal(at(20).deduction, 0.25); // 11:20 quarter day
  assert.equal(at(45).deduction, 0.5);  // 11:45 half day
  assert.equal(at(70).deduction, 1);    // 12:10 full day
  assert.equal(at(18).lateMinutes, 2);  // 11:18 → 2 minutes in Weekly Delay
});

test("Excuses: 1–2 free, 3rd and 4th half a day, 5th refused with an alert", () => {
  const ex = (n: number, m = 25) => attendanceDay({ kind: "excuse", minutesAfterStart: m, excuseNumberThisMonth: n });
  assert.equal(ex(2).deduction, 0);
  assert.equal(ex(3).deduction, 0.5);
  assert.equal(ex(5).alertManagement, true);
  assert.equal(ex(5).deduction, 0.25); // counted as normal lateness
  assert.equal(ex(2).lateMinutes, 9); // still in Weekly Delay
});

test("per-person tiers change the deduction only, not Weekly Delay", () => {
  const r = attendanceDay({ kind: "checkin", minutesAfterStart: 20 }, { quarterFrom: 30, halfFrom: 45, dayFrom: 60 });
  assert.equal(r.deduction, 0);
  assert.equal(r.lateMinutes, 4);
});

test("KPI items are proportional and may pass 100%", () => {
  assert.equal(achievement({ direction: "at-least", goal: 100 }, 120), 1.2);
  assert.equal(achievement({ direction: "at-most", goal: 1 }, 2), 0.5);  // ≤1% duplicates, actual 2%
  assert.equal(achievement({ direction: "at-most", goal: 0 }, 2), 0.5);  // "zero" goal, 2 occurrences
  assert.equal(achievement({ direction: "at-most", goal: 0 }, 0), 1);
  const card = cardScore([
    { title: "target", weight: 40, direction: "at-least", goal: 100, method: "system", actual: 100 },
    { title: "showings", weight: 60, direction: "at-least", goal: 30, method: "system", actual: 15 },
  ]);
  assert.equal(card, 70);
});

test("money bands: reward, partial, cut, Threshold", () => {
  const bonus = { base: "bonus" as const, amount: egp(10_000), monthlySalary: egp(12_000) };
  const salary = { base: "salary" as const, amount: egp(12_000), monthlySalary: egp(12_000) };
  assert.equal(payoutDelta(102, bonus), egp(1_500));
  assert.equal(payoutDelta(97, bonus), 0);
  assert.equal(payoutDelta(83, bonus), -egp(750));    // 7.5% of the bonus
  assert.equal(payoutDelta(65, salary), -egp(1_800)); // 15% of 12,000
  assert.equal(payoutDelta(40, bonus), -egp(11_800)); // bonus cancelled + 15% of salary
  assert.equal(bandOf(40), "threshold");
});

test("ideal employee: client example — team of 5, the other 4 lost 3,000 → the winner gets 3,000", () => {
  const m = (id: string, early: number, late: number, absent: number, ded: number, kpi: number | null = 90, pen = false) =>
    ({ id, earlyDays: early, lateHours: late, absentDays: absent, deductions: egp(ded), kpiScore: kpi, targetPercent: 50, hasPenalty: pen });
  const team = [m("a", 10, 0, 0, 0), m("b", 4, 3, 1, 1_000), m("c", 2, 5, 0, 800), m("d", 6, 1, 0, 700), m("e", 1, 2, 2, 500)];
  const r = idealEmployee(team);
  assert.equal(r.winner, "a");
  assert.equal(r.fund, egp(3_000));
  // a penalty or KPIs under 80% rule someone out even with the best points
  assert.equal(idealEmployee([m("a", 10, 0, 0, 0, 90, true), m("b", 4, 3, 1, 1_000)]).winner, "b");
  assert.equal(idealEmployee([m("a", 10, 0, 0, 0, 70), m("b", 4, 3, 1, 1_000)]).winner, "b");
});

test("permissions: roles add up, a personal override replaces them, any action implies view", () => {
  const sales = { scope: "own" as const, modules: { leads: ["create", "edit"] as const } };
  const tl = { scope: "team" as const, modules: { leads: ["approve"] as const, hr: ["approve"] as const } };
  const g = effectiveGrants([sales, tl]);
  assert.equal(g.can("leads", "view"), true);
  assert.equal(g.can("leads", "approve"), true);
  assert.equal(g.scope, "team");
  const o = effectiveGrants([sales], { leads: ["view"] });
  assert.equal(o.can("leads", "create"), false);
  assert.equal(g.can("finance", "view"), false);
});

test("notifications: email off means app only, unless the notification is important", async () => {
  const { channelsFor } = await import("../src/notifications.ts");
  assert.deepEqual(channelsFor(["app", "push", "email"], { emailNotifications: false }, false), ["app", "push"]);
  assert.deepEqual(channelsFor(["app", "push", "email"], { emailNotifications: false }, true), ["app", "push", "email"]);
  assert.deepEqual(channelsFor(["app"], { emailNotifications: true }, true), ["app"]);
});

test("permissions: normalised actions always include view and keep the matrix order", async () => {
  const { normalizeActions } = await import("../src/permissions.ts");
  assert.deepEqual(normalizeActions(["export", "edit", "edit"]), ["view", "edit", "export"]);
  assert.deepEqual(normalizeActions([]), []);
});

test("OTP «ابعت تاني»: only one minute after the last code (M-09 2.4)", async () => {
  const { otpResendWait } = await import("../src/permissions.ts");
  const sent = new Date("2026-11-04T10:00:00Z");
  assert.equal(otpResendWait(sent, sent), 60);
  assert.equal(otpResendWait(sent, new Date("2026-11-04T10:00:59.500Z")), 1);
  assert.equal(otpResendWait(sent, new Date("2026-11-04T10:01:00Z")), 0);
  assert.equal(otpResendWait(sent, new Date("2026-11-04T10:05:00Z")), 0);
});

test("M-09 7.2: a manager's team is everyone under him, at any depth, never himself", async () => {
  const { teamUnder } = await import("../src/permissions.ts");
  // the shape of the KPI file's structure: u2 ← u21 ← (u6 ← u5) · (u7 ← u8, u9, u10) · u14 · u16, and u1 ← u11
  const org = [
    { id: "u2", managerId: null }, { id: "u21", managerId: "u2" }, { id: "u6", managerId: "u21" }, { id: "u5", managerId: "u6" },
    { id: "u7", managerId: "u21" }, { id: "u8", managerId: "u7" }, { id: "u9", managerId: "u7" }, { id: "u10", managerId: "u7" },
    { id: "u14", managerId: "u21" }, { id: "u16", managerId: "u21" }, { id: "u1", managerId: null }, { id: "u11", managerId: "u1" },
  ];
  assert.deepEqual([...teamUnder("u7", org)].sort(), ["u10", "u8", "u9"]);
  assert.equal(teamUnder("u21", org).size, 8);
  assert.ok(!teamUnder("u21", org).has("u11")); // another branch
  assert.equal(teamUnder("u5", org).size, 0);
  assert.deepEqual([...teamUnder("a", [{ id: "a", managerId: "b" }, { id: "b", managerId: "a" }])], ["b"]); // a loop ends
});

test("M-09 4.1: the Operations Head gives and takes only what he has himself", async () => {
  const { withinOwnPermissions } = await import("../src/permissions.ts");
  const opsHead = effectiveGrants([{ scope: "all", modules: { inventory: ["view", "export"], tasks: ["view", "create", "edit"], access: ["view"] } }]);
  assert.equal(withinOwnPermissions(opsHead, "inventory", ["view"], ["view", "export"]), true); // open export for one person
  assert.equal(withinOwnPermissions(opsHead, "tasks", ["view", "create"], []), true);           // close a module he has
  assert.equal(withinOwnPermissions(opsHead, "finance", [], ["view"]), false);                   // finance: not his
  assert.equal(withinOwnPermissions(opsHead, "access", ["view"], ["view", "edit"]), false);      // management: not his
  assert.equal(withinOwnPermissions(opsHead, "inventory", ["view", "edit"], ["view"]), false);   // can't take what he doesn't have
});

test("handover (M-09 2.2 · 7.1): a stopped account's work goes to a working account, approved by the direct manager", async () => {
  const { handoverRefusal } = await import("../src/permissions.ts");
  const ok = { leaving: true, managerUserId: "mgr", fromId: "a", toId: "b", toActive: true, pending: false };
  assert.equal(handoverRefusal(ok), null);
  assert.match(handoverRefusal({ ...ok, leaving: false })!, /لسه شغال/);
  assert.match(handoverRefusal({ ...ok, pending: true })!, /مستني موافقة/);
  assert.match(handoverRefusal({ ...ok, managerUserId: null })!, /مدير مباشر/);
  assert.match(handoverRefusal({ ...ok, toId: "a" })!, /حد تاني/);
  assert.match(handoverRefusal({ ...ok, toActive: false })!, /حسابه يكون شغال/);
});
