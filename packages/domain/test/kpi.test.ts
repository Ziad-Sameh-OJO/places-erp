import { test } from "node:test";
import assert from "node:assert/strict";
import { bandLabel, calcText, canEnterManual, canManageCard, invManagerMakesCard, closeAlert, itemAchievement, levelLabel, metricProblem, nextQuarter, payoutDelta, previousQuarter, quarterLabel, quarterMidpoint, endOfLocalDay, onTimeShare, pettyCapScore, secondCallExcluded, pct, perWeek, kpiPeriodStart, salesAttendance, timedTasks, timeliness, tasksOnTime, taskCardFollower, METRICS } from "../src/kpi.ts";
import { monthDeduction } from "../src/attendance.ts";

test("11.6 · the client's bands reach payroll: 102% on a 10,000 bonus → +1,500, 65% on a 12,000 salary → −1,800", () => {
  const bonus = payoutDelta(102, { base: "bonus", amount: 10_000_00, monthlySalary: 12_000_00 });
  const cut = payoutDelta(65, { base: "salary", amount: 12_000_00, monthlySalary: 12_000_00 });
  assert.deepEqual([bonus, cut], [1_500_00, -1_800_00]);
  // a reward lowers the month's line below zero (paid on top), a cut adds to the attendance deduction (13,000 → 500 a day)
  assert.equal(monthDeduction({ salary: 12_000_00, attendanceDays: 0, penaltyDays: 0, kpi: bonus }).amount, -1_500_00);
  assert.equal(monthDeduction({ salary: 13_000_00, attendanceDays: 1, penaltyDays: 0, kpi: cut }).amount, 2_300_00);
  assert.equal(monthDeduction({ salary: 2_600_00, attendanceDays: 1, penaltyDays: 0, kpi: -11_800_00 }).amount, 2_600_00); // never above the salary
});

test("11.6 · mid-quarter, and what the closed result triggers", () => {
  assert.equal(quarterMidpoint("2026-Q4"), "2026-11-15");
  assert.equal(quarterMidpoint("2027-Q1"), "2027-02-15");
  assert.equal(previousQuarter("2027-Q1"), "2026-Q4");
  assert.equal(closeAlert(80, null), null);
  assert.equal(closeAlert(65, 40), "plan");
  assert.equal(closeAlert(45, null), "warning");
  assert.equal(closeAlert(45, 60), "warning");
  assert.equal(closeAlert(45, 48), "hr"); // two quarters in a row under 50%
});

test("11.11 · a new quarter follows the last one, across the year", () => {
  assert.equal(nextQuarter("2026-Q4"), "2027-Q1");
  assert.equal(nextQuarter("2027-Q1"), "2027-Q2");
  assert.equal(quarterLabel("2026-Q4"), "Q4 2026");
});

test("11.2 · a hand-in item counts its hand-ins against the times due; the rest count their value", () => {
  // Heba's daily report: 38 of 40 days
  assert.equal(itemAchievement({ method: "report", direction: "at-least", goal: 0, value: null, required: 40, delivered: 38 }), 0.95);
  // Hadeer's calls: 120 of 100 a day is 120% (client 28/10)
  assert.equal(itemAchievement({ method: "system", direction: "at-least", goal: 100, value: 120, required: null, delivered: 0 }), 1.2);
  // a system item the daily job hasn't measured yet counts as 0
  assert.equal(itemAchievement({ method: "system", direction: "at-least", goal: 90, value: null, required: null, delivered: 0 }), 0);
});

test("meeting 4 Nov · a manual item is typed by whoever it names: the follower by default, a person or a role", () => {
  const nancy = { userId: "u21", roles: ["officemgr"], isFollower: false };
  assert.equal(canEnterManual([], { userId: "x", roles: [], isFollower: true }), true);
  assert.equal(canEnterManual(["follower"], nancy), false);
  assert.equal(canEnterManual(["u21"], nancy), true);
  assert.equal(canEnterManual(["officemgr"], nancy), true);
});

test("11.11 · «بيتحسب» says exactly where the number comes from", () => {
  const base = { metric: null, params: {}, report: null, required: null, enteredBy: [], source: "" };
  assert.equal(calcText({ ...base, method: "system", metric: "calls", params: { per: "week", avg: "week" } }, String),
    "عدد المكالمات اللي سجّلها بنفسه على الليدز · آخر 7 أيام · متوسط في الأسبوع");
  assert.equal(calcText({ ...base, method: "system" }, String), "لسه ماتحددش بيتحسب من إيه");
  assert.equal(calcText({ ...base, method: "report", required: 8 }, String), "بيسلّمه بنفسه من الكارت · مطلوب 8 مرة في الربع");
  assert.equal(calcText({ ...base, method: "manual", enteredBy: ["u21"], source: "مراجعة نانسي" }, () => "نانسي"), "بيدخّله نانسي بإيده · من مراجعة نانسي");
});

test("11.11 · only catalog metrics with their own settings are saved", () => {
  assert.equal(metricProblem("calls", { per: "month" }), null);
  assert.equal(metricProblem("nope", {}), "المقياس ده مش في الكتالوج");
  assert.match(metricProblem("calls", { min: 30 }) ?? "", /مالوش إعداد min/);
  assert.equal(metricProblem(null, {}), null);
});

test("11.14 · the watcher reads the tier without money", () => {
  assert.equal(bandLabel(102), "مكافأة 15%");
  assert.equal(levelLabel(102), "محقق");
  assert.equal(levelLabel(80), "محتاج متابعة");
  assert.equal(levelLabel(60), "ضعيف · خطة تحسين");
  assert.equal(levelLabel(40), "تحت الحد");
});

const at = (s: string) => new Date(s);

test("11.5 · the daily job's numbers match the client's examples (M-12 7.1)", () => {
  // Hadeer called 90 leads of 100 within 30 minutes: 90%, her goal → the item is met
  const hadeer = pct(90, 100)!;
  assert.equal(hadeer, 90);
  assert.equal(itemAchievement({ method: "system", direction: "at-least", goal: 90, value: hadeer, required: null, delivered: 0 }), 1);
  // Bayoumi shot 8 of 10 new units within 72 hours: 80% of a 90% goal → 89%
  assert.equal(Math.round(itemAchievement({ method: "system", direction: "at-least", goal: 90, value: pct(8, 10), required: null, delivered: 0 }) * 100), 89);
  assert.equal(pct(0, 0), null);
  assert.equal(pct(0, 0, 100), 100);
});

test("11.5 · an item's period: last 7 days, the Cairo month, the quarter", () => {
  const now = at("2026-11-05T10:00:00Z");
  assert.equal(kpiPeriodStart("week", now, "2026-Q4").toISOString(), "2026-10-29T10:00:00.000Z");
  assert.equal(kpiPeriodStart("month", now, "2026-Q4").toISOString(), "2026-10-31T22:00:00.000Z"); // 1 Nov, Cairo (+2)
  assert.equal(kpiPeriodStart(undefined, now, "2026-Q4").toISOString(), "2026-09-30T21:00:00.000Z"); // 1 Oct, Cairo summer time (+3)
  assert.equal(perWeek(14, at("2026-10-22T10:00:00Z"), now), 7); // 14 in two weeks
  assert.equal(perWeek(3, at("2026-11-04T10:00:00Z"), now), 3); // less than a week counts as one
});

test("11.15 · on time / late / still waiting (not counted)", () => {
  const now = at("2026-11-05T12:00:00Z");
  const due = at("2026-11-05T11:00:00Z");
  assert.equal(timeliness(at("2026-11-05T10:59:00Z"), due, now), "ok");
  assert.equal(timeliness(at("2026-11-05T11:30:00Z"), due, now), "late");
  assert.equal(timeliness(null, due, now), "late"); // waiting past the time
  assert.equal(timeliness(null, at("2026-11-05T13:00:00Z"), now), "waiting");
  // «5 في الميعاد من 8»: the waiting ones aren't counted
  assert.equal(onTimeShare(["ok", "ok", "ok", "ok", "ok", "late", "late", "late", "waiting"]), 62.5);
  assert.equal(onTimeShare(["waiting"]), 100);
  // a lead of 5 Nov 23:30 Cairo is due by Cairo midnight
  assert.equal(endOfLocalDay(at("2026-11-05T21:30:00Z")).toISOString(), "2026-11-05T22:00:00.000Z");
  // the Channels left out of the Second Calls: «By Safwat» by default, else the item's list
  assert.deepEqual(secondCallExcluded({}), ["By Safwat"]);
  assert.deepEqual(secondCallExcluded({ excl: "By Safwat, Referral ," }), ["By Safwat", "Referral"]);
});

test("11.15 · New Lead in 30 minutes and Draft decisions in 24 hours: in time / late / still waiting isn't counted", () => {
  const now = at("2026-11-05T12:00:00Z"), m = (iso: string) => at(`2026-11-05T${iso}:00Z`);
  const nl = timedTasks([
    { name: "A", at: m("10:00"), doneAt: m("10:30") }, // in time, on the minute
    { name: "B", at: m("10:00"), doneAt: m("10:42") }, // late
    { name: "C", at: m("11:00"), doneAt: null }, // waiting past 30 minutes → late
    { name: "D", at: m("11:45"), doneAt: null }, // still in time → not counted
  ], 30 * 60_000, now, "min");
  assert.equal(nl.value, 33.3);
  assert.equal(nl.detail, "1 في الميعاد من 3 · اتأخرت في: B (42 د)، C (60 د، لسه مستني)");
  const dr = timedTasks([
    { name: "E", at: at("2026-11-04T08:00:00Z"), doneAt: at("2026-11-04T20:00:00Z"), tag: "Draft" },
    { name: "F", at: at("2026-11-04T08:00:00Z"), doneAt: null, tag: "Draft Admin" },
  ], 24 * 3_600_000, now, "hour");
  assert.equal(dr.value, 50);
  assert.equal(dr.detail, "1 في الميعاد من 2 · اتأخرت في: F (Draft Admin · 28 س، لسه مستني)");
  assert.deepEqual(timedTasks([], 60_000, now, "min"), { value: 100, detail: "0 في الميعاد من 0" });
});

test("«الحضور (السيلز)»: half for absence up to 5 days, half for lateness up to 6 hours", () => {
  assert.equal(salesAttendance(0, 0), 100);
  assert.equal(salesAttendance(5, 6), 100);
  assert.equal(salesAttendance(10, 3), 75);
  assert.equal(salesAttendance(5, 12), 75);
});

test("M-08 3.1 · «الالتزام بسقف العهدة»: Mokhtar's safe at or under its 50,000 ceiling = 100%, over it = 0%, no ceiling = not measured", () => {
  assert.equal(pettyCapScore([{ balance: 50_000_00, cap: 50_000_00 }]), 100);
  assert.equal(pettyCapScore([{ balance: 50_000_01, cap: 50_000_00 }]), 0);
  assert.equal(pettyCapScore([{ balance: 12_000_00, cap: 50_000_00 }, { balance: 9_000_00, cap: 5_000_00 }]), 0); // one safe over is enough
  assert.equal(pettyCapScore([]), null);
});

test("4.15 «المهام في ميعادها»: Done by the end of its Cairo day counts on time; a late one, and an open one past its day, late; one still on its day waits", () => {
  const now = new Date("2026-11-10T10:00:00Z"); // 10 Nov, 12:00 Cairo
  const onTime = { dueOn: "2026-11-08", doneAt: new Date("2026-11-08T20:30:00Z") }; // 8 Nov 22:30 Cairo
  const lateDone = { dueOn: "2026-11-08", doneAt: new Date("2026-11-08T22:30:00Z") }; // 9 Nov 00:30 Cairo
  const openPast = { dueOn: "2026-11-09", doneAt: null };
  const today = { dueOn: "2026-11-10", doneAt: null }; // its day hasn't passed: not counted yet
  const early = { dueOn: "2026-11-12", doneAt: new Date("2026-11-09T09:00:00Z") }; // Done before its day: counted, on time
  assert.equal(tasksOnTime([onTime, lateDone, openPast, today, early], now), 50); // 2 on time of the 4 counted
  assert.equal(tasksOnTime([today], now), 100); // only one still on its day: nothing counted yet
});

test("4.15: the card made for a task's assignee is followed by the sender in the same department, else by the owners", () => {
  assert.equal(taskCardFollower({ id: "manar", department: "Inventory" }, "Inventory"), "manar");
  assert.equal(taskCardFollower({ id: "manar", department: "Inventory" }, "Marketing"), null);
  assert.equal(taskCardFollower(null, "Inventory"), null);
  assert.equal(METRICS.tasksOnTime?.label, "المهام في ميعادها");
  assert.equal(tasksOnTime([], new Date()), 100); // nothing sent with «أيوه» yet: 100, as the demo
});

test("11.19 · Manar manages her own card's items (not anyone else's own card); she makes cards for her inventory team only", () => {
  const base = { isFollower: false, edit: false, watcher: false, roles: ["inventory"], ownCard: true };
  assert.equal(canManageCard(base), true);
  assert.equal(canManageCard({ ...base, roles: ["sales"] }), false); // a salesperson doesn't change his own card
  assert.equal(canManageCard({ ...base, ownCard: false }), false);
  assert.equal(canManageCard({ ...base, roles: ["sales"], isFollower: true }), true);
  assert.equal(invManagerMakesCard(["inventory"], "manar", { id: "randa", department: "Inventory" }), true);
  assert.equal(invManagerMakesCard(["inventory"], "manar", { id: "manar", department: "Inventory" }), false);
  assert.equal(invManagerMakesCard(["inventory"], "manar", { id: "x", department: "Sales" }), false);
  assert.equal(invManagerMakesCard(["tl"], "y", { id: "randa", department: "Inventory" }), false);
});
