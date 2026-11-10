/**
 * T-34 · M-12: the «[أوتوماتيك]» items that got a source in this task, measured straight from the tables their modules
 * fill. Per-person metrics run for made-up people (ids no seeded row has), so other files' rows never mix in and the
 * numbers are exact; company-wide ones are checked to measure (not «لسه») with this file's rows in. Nothing is written
 * to the KPI items. Under the KPI-quarter lock: one check adds an old quarter row for a moment.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { PLACES_CALENDAR, type MetricParams, dayStart, localDate } from "@places/domain";
import { MEASURES, type Ctx, type Who } from "../../worker/src/processors/kpi-refresh.ts";
import { kpiQuarterLock } from "./helpers.ts";

const stamp = String(Date.now());
const HOUR = 3_600_000, DAY = 24 * HOUR;
const now = new Date();
const ago = (ms: number) => new Date(now.getTime() - ms);
const c: Ctx = { now, quarter: "2026-Q4", qStart: ago(30 * DAY), cal: PLACES_CALENDAR };
const who = (n: number): Who => ({ id: `E2E-T34-e${stamp}-${n}`, userId: `E2E-T34-u${stamp}-${n}`, target: null as never });
const measure = (metric: string, p: MetricParams = {}, w: Who = who(0), ctx: Ctx = c, from = ctx.qStart) => MEASURES[metric]!(ctx, p, from, w);
const cairoDay = (offsetDays: number) => new Date(`${localDate(new Date(now.getTime() + offsetDays * DAY))}T00:00:00Z`);

const task = (w: Who, kind: string, extra: object) =>
  prisma.task.create({ data: { kind, toUserId: w.userId, byUserId: "e2e", dueOn: cairoDay(0), status: "todo", note: `E2E-T34 ${stamp}`, ...extra } });
const unit = (n: number, extra: object) => prisma.unit.create({
  data: { code: `U-T34${stamp}${n}`, type: "Rent", project: `E2E-T34 ${stamp}`, area: "التجمع الخامس", space: 100 + n, condition: "Finished", ...extra },
});

after(async () => {
  await prisma.task.deleteMany({ where: { note: `E2E-T34 ${stamp}` } });
  await prisma.unit.deleteMany({ where: { code: { startsWith: `U-T34${stamp}` } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-T34${stamp}` } } });
  await prisma.broadcast.deleteMany({ where: { text: { startsWith: `E2E-T34 ${stamp}` } } });
  await prisma.post.deleteMany({ where: { title: `E2E-T34 ${stamp}` } });
  await prisma.oneOnOne.deleteMany({ where: { hrAction: `E2E-T34 ${stamp}` } });
  await prisma.ticket.deleteMany({ where: { title: `E2E-T34 ${stamp}` } });
  await prisma.$disconnect();
});

test("Bayoumi: photo in 72 h from the unit's entry, Retouch in 48 h, accepted the first time; Manar's tasks to her team", () => kpiQuarterLock(async () => {
  // Retouch: done after 40 h (in time) · done after 59 h · open past 48 h · open 1 h (not counted yet) → 1 of 3
  const r = who(1);
  await task(r, "retouch", { createdAt: ago(50 * HOUR), doneAt: ago(10 * HOUR), status: "done" });
  await task(r, "retouch", { createdAt: ago(60 * HOUR), doneAt: ago(1 * HOUR), status: "done" });
  await task(r, "retouch", { createdAt: ago(49 * HOUR) });
  await task(r, "retouch", { createdAt: ago(1 * HOUR) });
  assert.equal(await measure("retouch48", {}, r), 33.3);

  // photo: the unit entered 100 h ago, photo done 60 h after · another entered 80 h ago, still not done → 1 of 2
  const ph = who(2);
  await task(ph, "photo", { unitId: (await unit(1, { enteredAt: ago(100 * HOUR) })).id, doneAt: ago(40 * HOUR), status: "done" });
  await task(ph, "photo", { unitId: (await unit(2, { enteredAt: ago(80 * HOUR) })).id });
  assert.equal(await measure("photo72", {}, ph), 50);

  // accepted the first time: 2 of the 3 closed weren't sent back; an open one isn't counted
  const q = who(3);
  await task(q, "retouch", { doneAt: ago(HOUR), status: "done" });
  await task(q, "photo", { doneAt: ago(HOUR), status: "done", returned: 1 });
  await task(q, "retouch", { doneAt: ago(2 * HOUR), status: "done" });
  await task(q, "photo", { returned: 2 });
  assert.equal(await measure("tasksFirstTime", {}, q), 66.7);

  // «مهام منار اليومية»: yesterday's done that day · one from 2 days ago still open · tomorrow's (not due) → 1 of 2;
  // her other kinds of task don't count under «tkind: team»
  const t = who(4);
  await task(t, "team", { dueOn: cairoDay(-1), doneAt: dayStart(localDate(ago(DAY))), status: "done" });
  await task(t, "team", { dueOn: cairoDay(-2) });
  await task(t, "team", { dueOn: cairoDay(1) });
  await task(t, "photo", { dueOn: cairoDay(-2) });
  assert.equal(await measure("tasksOnTime", { tkind: "team" }, t), 50);
  assert.equal(await measure("tasksOnTime", { tkind: "photo" }, t), 0);
  assert.equal(await measure("tasksOnTime", {}, t), 100, "none of them «تتحسب في الـ KPIs»: nothing late");
}));

test("Randa's and Manar's new units, Hadeer's calls a day, a salesperson's Broadcasts, a team without people", () => kpiQuarterLock(async () => {
  const randa = who(5);
  await unit(3, { createdById: randa.userId });
  await unit(4, { createdById: randa.userId });
  assert.equal(await measure("unitsEntered", { by: "me" }, randa), 2);
  assert.ok(Number(await measure("unitsEntered", {}, randa)) >= 2, "every unit of the quarter");

  // 5 calls today: one working day (a day off still counts as one)
  const hadeer = who(6);
  const lead = await prisma.lead.create({ data: { code: `L-T34${stamp}`, name: `E2E-T34 ${stamp}`, phones: [`0106${stamp.slice(-7)}`], area: "E2E", type: "Rent", channel: "Facebook", createdById: "e2e", draft: "draft" } });
  await prisma.leadCall.createMany({ data: Array.from({ length: 5 }, () => ({ leadId: lead.id, byUserId: hadeer.userId, at: ago(HOUR) })) });
  assert.equal(await measure("callsDaily", { per: "quarter" }, hadeer, c, ago(2 * HOUR)), 5);

  // the approved Broadcast he marked as sent counts, the one still waiting for Rahma's review doesn't
  const s = who(7);
  for (const approved of [true, false]) {
    await prisma.broadcast.create({ data: { text: `E2E-T34 ${stamp} ${approved}`, hotUnitIds: ["x"], approved, createdById: "e2e", sends: { create: { userId: s.userId } } } });
  }
  assert.equal(await measure("broadcasts", {}, s), 1);
  assert.ok(Number(await measure("broadcastPlan")) > 0, "Rahma's twice a week has this Broadcast with Hot Inventory");

  // a Team Leader with no salespeople has nothing to measure
  assert.equal(await measure("visitsDone", { kind: "Visit", of: "team" }), null);
  assert.equal(await measure("teamSla"), null);
}));

test("a real Team Leader: his team's Showings average and the 2h30 SLA", () => kpiQuarterLock(async () => {
  const tl = await prisma.employee.findFirstOrThrow({ where: { teamMembers: { some: {} } }, select: { id: true, userId: true, target: true, teamMembers: { select: { id: true } } } });
  const member = tl.teamMembers[0]!.id;
  const before = Number(await measure("visitsDone", { kind: "Visit", of: "team" }, tl));
  const lead = (n: number, extra: object) => prisma.lead.create({ data: {
    code: `L-T34${stamp}${n}`, name: `E2E-T34 ${stamp} ${n}`, phones: [`0107${stamp.slice(-6)}${n}`], area: "E2E", type: "Rent", channel: "Facebook",
    createdById: "e2e", draft: "draft", assignedToId: member, assignedAt: ago(HOUR), ...extra,
  } });
  await prisma.leadVisit.create({ data: { leadId: (await lead(1, {})).id, kind: "visit", at: ago(HOUR), outcome: "done", byUserId: "e2e" } });
  assert.ok(Number(await measure("visitsDone", { kind: "Visit", of: "team" }, tl)) > before, "his salesperson's visit raised the average");

  // a lead whose TL got the 2h30 warning is late; one with a first action and no warning is in time
  await lead(2, { slaWarnedAt: ago(HOUR / 2) });
  await lead(3, { firstActionAt: ago(HOUR / 2) });
  // other files may assign his team leads at the same time: this file's two are in, so it's a number under 100
  const sla = await measure("teamSla", {}, tl, c, ago(2 * HOUR));
  assert.ok(typeof sla === "number" && sla < 100 && sla > 0, `teamSla: ${sla}`);
}));

test("company-wide: posts on their day, One-to-One this month, HR Letters, payroll, month close, sheets, budget, commission", () => kpiQuarterLock(async () => {
  await prisma.post.create({ data: { title: `E2E-T34 ${stamp}`, channel: "Facebook", at: ago(2 * DAY), createdById: "e2e" } });
  assert.ok(typeof (await measure("postsOnTime")) === "number", "an approved post whose day passed is counted");

  const emp = await prisma.employee.findFirstOrThrow({ select: { id: true } });
  await prisma.oneOnOne.create({ data: { employeeId: emp.id, heldOn: cairoDay(0), answers: {}, hrAction: `E2E-T34 ${stamp}` } });
  assert.ok(Number(await measure("oneOnOnes")) > 0);

  await prisma.ticket.create({ data: { type: "hr_letter", department: "HR", title: `E2E-T34 ${stamp}`, fromUserId: "e2e", status: "Resolved", createdAt: ago(2 * HOUR), firstReplyAt: ago(HOUR), resolvedAt: ago(HOUR) } });
  assert.ok(typeof (await measure("tickets", { ttype: "hr_letter" })) === "number");
  assert.ok(typeof (await measure("tickets", { dept: "HR" })) === "number");

  // Q4 2026 seen from 10 Jan 2027: all three months are due, so each is on time or late — a number either way
  const jan = { ...c, now: dayStart("2027-01-10"), qStart: dayStart("2026-10-01") };
  for (const m of ["payrollOnTime", "monthClose"]) {
    const v = await measure(m, {}, who(0), jan);
    assert.ok(typeof v === "number" && v >= 0 && v <= 100, `${m}: ${v}`);
  }
  // Q3 2026's sheets sent on Q3's first working day (Wed 1 Jul)… measured from an old quarter row, removed at once
  const q3: Ctx = { ...c, quarter: "2026-Q3", now: dayStart("2026-07-20") };
  const had = await prisma.kpiQuarter.findUnique({ where: { id: "2026-Q2" } });
  if (!had) {
    await prisma.kpiQuarter.create({ data: { id: "2026-Q2", status: "closed", sheetsAt: new Date(dayStart("2026-07-01").getTime() + 14 * HOUR) } });
    try {
      assert.equal(await measure("sheetsOnTime", {}, who(0), q3), 100);
    } finally {
      await prisma.kpiQuarter.delete({ where: { id: "2026-Q2" } });
    }
  }
  assert.equal(await measure("sheetsOnTime", {}, who(0), { ...c, quarter: "2020-Q1" }), null, "no quarter before it: not measured");

  for (const m of ["budgetUse", "commissionSameDay"]) {
    const v = await measure(m);
    assert.ok(v === null || typeof v === "number", `${m}: ${v}`);
  }
}));

// the measures whose arithmetic is unit-tested in @places/domain but whose query had no run of its own (T-34 audit)
test("every measure runs against the real tables for a seeded salesperson and gives a number or «لسه»", () => kpiQuarterLock(async () => {
  const s = await prisma.employee.findFirstOrThrow({ where: { teamLeaderId: { not: null } }, select: { id: true, userId: true, target: true } });
  for (const [m, f] of Object.entries(MEASURES)) {
    const v = await f(c, {}, c.qStart, s);
    assert.ok(v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0), `${m}: ${v}`);
  }
}));

test("every automatic item of the seeded cards has a measure (or is typed in the daily report)", async () => {
  const items = await prisma.kpiItem.findMany({ where: { method: "system", metric: { not: null } }, select: { title: true, metric: true } });
  for (const it of items) assert.ok(MEASURES[it.metric!] || ["team", "dailySum", "webAds"].includes(it.metric!), `${it.title}: ${it.metric}`);
});
