/**
 * M-12 · scheduled reports (11.10), the daily report (11.12), monthly targets and ranking (11.8) against the real API.
 * Team C (TL Abdelrahman Younes) is used: Youssef Hosny hands in, Ahmed Amr is a salesperson without «reports», the TL of
 * team B is the one who may not look. The worker's tick runs with a clock set in 2021, so only this file's reports (created
 * «back then») are due; the seeded ones are newer and skipped (first run). Everything the file makes is removed in `after`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { isWorkingDay, localDate } from "@places/domain";
import { call, session } from "./helpers.ts";
import { scheduledReportsTick } from "../../worker/src/processors/scheduled-reports.ts";

const RUN = `E2E-RPT-${Date.now()}`;
const start = new Date();
let admin: string, nancy: string, tlC: string, tlB: string, hosny: string, amr: string;
const ids = { hosny: "", hosnyUser: "", amrUser: "", amrEmp: "", tlCEmp: "", tlCUser: "", adminUser: "", item: "", sumItem: "", sumKey: "", report: "", unit: "", deal: "" };
const today = localDate(new Date());
const month = today.slice(0, 7);

before(async () => {
  [admin, nancy, tlC, tlB, hosny, amr] = await Promise.all(["ahmed.islam@places.com", "nancy.islam@places.com", "abdelrahman.younes@places.com",
    "mostafa.ezzat@places.com", "youssef.hosny@places.com", "ahmed.amr@places.com"].map((e) => session(e)));
  const emp = (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } }, select: { id: true, userId: true } });
  const [h, a, t, ad] = await Promise.all([emp("youssef.hosny@places.com"), emp("ahmed.amr@places.com"), emp("abdelrahman.younes@places.com"), emp("ahmed.islam@places.com")]);
  Object.assign(ids, { hosny: h.id, hosnyUser: h.userId, amrUser: a.userId, amrEmp: a.id, tlCEmp: t.id, tlCUser: t.userId, adminUser: ad.userId });
  // a hand-in item and a «typed in the daily report» item on Hosny's card this quarter (weight 0: the card stays at 100%)
  const q = await prisma.kpiQuarter.findFirstOrThrow({ orderBy: { id: "desc" } });
  const card = await prisma.kpiCard.findUniqueOrThrow({ where: { quarter_employeeId: { quarter: q.id, employeeId: h.id } } });
  const base = { cardId: card.id, weight: 0, targetText: RUN, direction: "at-least", goal: 10 };
  ids.item = (await prisma.kpiItem.create({ data: { ...base, position: 901, title: `${RUN} تسليم`, method: "report", required: 5 } })).id;
  const sum = await prisma.kpiItem.create({ data: { ...base, position: 902, title: `${RUN} عدد الملاك`, method: "system", metric: "dailySum", params: {} } });
  Object.assign(ids, { sumItem: sum.id, sumKey: sum.key });
});

after(async () => {
  await prisma.scheduledReport.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.kpiItem.deleteMany({ where: { targetText: RUN } });
  await prisma.dailyReport.deleteMany({ where: { userId: ids.hosnyUser } });
  await prisma.reportHandIn.deleteMany({ where: { reportId: "sr-daily", userId: ids.hosnyUser } });
  await prisma.dailyReportField.deleteMany({ where: { label: { startsWith: RUN } } });
  await prisma.salesTarget.deleteMany({ where: { employeeId: { in: [ids.hosny, ids.amrEmp] } } });
  if (ids.deal) await prisma.payment.deleteMany({ where: { dealId: ids.deal } });
  if (ids.deal) await prisma.deal.deleteMany({ where: { id: ids.deal } });
  if (ids.unit) await prisma.unit.deleteMany({ where: { id: ids.unit } });
  await prisma.notification.deleteMany({ where: { OR: [{ text: { contains: RUN } }, { link: { in: ["/reports", "/kpis"] }, createdAt: { gte: start }, text: { contains: "سلّم" } }] } });
  await prisma.auditLog.deleteMany({ where: { module: "reports", at: { gte: start } } });
  await prisma.$disconnect();
});

const report = (over: Record<string, unknown> = {}) => ({
  name: `${RUN} تقرير أسبوعي`, kind: "handin", freq: "weekly", day: new Date(`${today}T12:00:00Z`).getUTCDay(), time: "23:59",
  preparedBy: [ids.hosnyUser], recipients: ["follower"], lateNotify: ["follower"], remindMin: 60, kpiItems: [ids.item], ...over,
});

test("11.10 · «التقارير ومواعيدها»: the TL sees them, only «reports: edit» changes them, a salesperson doesn't get in", async () => {
  assert.equal((await call("/reports/scheduled", { cookie: amr })).status, 403);
  const seen = await call("/reports/scheduled", { cookie: tlC });
  assert.equal(seen.status, 200);
  assert.ok(seen.body.reports.some((r: { name: string; content: string }) => r.name === "تقرير الأداء الشهري" && r.content === "performance"));
  assert.equal(seen.body.options, null);
  assert.equal((await call("/reports/scheduled", { method: "POST", cookie: tlC, body: report() })).status, 403);
  const bad = await call("/reports/scheduled", { method: "POST", cookie: admin, body: report({ preparedBy: [] }) });
  assert.equal(bad.status, 400);
  const made = await call("/reports/scheduled", { method: "POST", cookie: admin, body: report() });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  ids.report = made.body.id;
  const r = (await call("/reports/scheduled", { cookie: admin })).body.reports.find((x: { id: string }) => x.id === ids.report);
  assert.deepEqual(r.kpiItems.map((x: { id: string }) => x.id), [ids.item]);
  assert.deepEqual(r.handed, { got: 0, of: 1 });
  assert.equal((await prisma.auditLog.count({ where: { module: "reports", entityId: ids.report, action: "create" } })), 1);
});

test("11.10 · «سلّمت»: only the one it names, once per period; on time it counts in the linked KPI item", async () => {
  const mine = await call("/reports/mine", { cookie: hosny });
  assert.ok(mine.body.some((x: { reportId: string; kpi: boolean }) => x.reportId === ids.report && x.kpi));
  assert.equal((await call(`/reports/scheduled/${ids.report}/hand-in`, { method: "POST", cookie: amr })).status, 403);
  const ok = await call(`/reports/scheduled/${ids.report}/hand-in`, { method: "POST", cookie: hosny });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.deepEqual(ok.body, { onTime: true, counted: true });
  assert.equal((await call(`/reports/scheduled/${ids.report}/hand-in`, { method: "POST", cookie: hosny })).status, 409);
  assert.equal(await prisma.kpiDelivery.count({ where: { itemId: ids.item } }), 1);
  assert.ok(!(await call("/reports/mine", { cookie: hosny })).body.some((x: { reportId: string }) => x.reportId === ids.report));
  // the follower (team C's TL) heard of it
  assert.equal(await prisma.notification.count({ where: { userId: ids.tlCUser, text: { contains: `سلّم «${RUN}` } } }), 1);
});

test("11.10 · the job with a set clock: a reminder before the deadline, one late notice after it, an auto report built once", async () => {
  const old = new Date("2020-01-01T00:00:00Z");
  // Thursday 3 June 2021, Cairo = UTC+2: the deadline 18:00 is 16:00Z
  const h = await prisma.scheduledReport.create({ data: { name: `${RUN} متأخر`, kind: "handin", freq: "weekly", day: 4, time: "18:00", preparedBy: [ids.amrUser], recipients: [ids.adminUser], lateNotify: ["follower"], remindMin: 60, createdAt: old } });
  const a = await prisma.scheduledReport.create({ data: { name: `${RUN} أداء`, kind: "auto", freq: "weekly", day: 4, time: "09:00", fmt: "Excel", content: "performance", recipients: [ids.adminUser], createdAt: old } });
  const fresh = await prisma.scheduledReport.create({ data: { name: `${RUN} جديد`, kind: "auto", freq: "weekly", day: 4, time: "09:00", content: "performance", recipients: [ids.adminUser] } });
  const told = (userId: string, what: string) => prisma.notification.count({ where: { userId, text: { contains: `${RUN} ${what}` } } });
  await scheduledReportsTick(new Date("2021-06-03T14:30:00Z"));
  assert.equal(await told(ids.amrUser, "متأخر"), 0); // 90 minutes before: nothing yet
  await scheduledReportsTick(new Date("2021-06-03T15:30:00Z"));
  await scheduledReportsTick(new Date("2021-06-03T15:40:00Z"));
  assert.equal(await told(ids.amrUser, "متأخر"), 1); // the reminder, once
  await scheduledReportsTick(new Date("2021-06-03T16:30:00Z"));
  await scheduledReportsTick(new Date("2021-06-03T17:30:00Z"));
  assert.equal(await told(ids.amrUser, "متأخر"), 2); // + the late notice, once
  assert.equal(await told(ids.tlCUser, "متأخر"), 1); // his follower
  const runs = await prisma.reportRun.findMany({ where: { reportId: { in: [a.id, fresh.id] } } });
  assert.equal(runs.length, 1); // the new report doesn't send a 2021 period (first run)
  assert.equal(runs[0]!.period, "2021-06-03");
  assert.equal(await told(ids.adminUser, "أداء"), 1);
  const file = await fetch(`${process.env.API_URL ?? "http://localhost:4000"}/api/v1/reports/runs/${runs[0]!.id}/file`, { headers: { cookie: admin } });
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-type") ?? "", /spreadsheetml/);
  assert.equal((await call(`/reports/runs/${runs[0]!.id}/file`, { cookie: amr })).status, 403);
  assert.equal((await prisma.reportHandIn.findFirstOrThrow({ where: { reportId: h.id } })).at, null);
});

test("11.12 · extra fields: the admin adds one, it shows in the form and in the day's report; the TL of another team can't look", async () => {
  assert.equal((await call("/reports/daily/fields", { method: "POST", cookie: amr, body: { userId: ids.hosnyUser, label: `${RUN} x`, type: "number" } })).status, 403);
  const f = await call("/reports/daily/fields", { method: "POST", cookie: admin, body: { userId: ids.hosnyUser, label: `${RUN} عدد الشركات`, type: "number" } });
  assert.equal(f.status, 201, JSON.stringify(f.body));
  const form = await call("/reports/daily/me", { cookie: hosny });
  assert.equal(form.status, 200, JSON.stringify(form.body));
  assert.ok(form.body.fields.some((x: { id: string }) => x.id === f.body.id));
  assert.ok(form.body.items.some((x: { key: string; auto: boolean }) => x.key === ids.sumKey && !x.auto));
  assert.equal((await call(`/reports/daily/day?userId=${ids.hosnyUser}`, { cookie: tlB })).status, 404);
  const day = await call(`/reports/daily/day?userId=${ids.hosnyUser}`, { cookie: tlC });
  assert.equal(day.status, 200, JSON.stringify(day.body));
  assert.ok(day.body.shape.some((x: { fieldId: string | null }) => x.fieldId === f.body.id));
  assert.ok(day.body.team.some((x: { userId: string }) => x.userId === ids.hosnyUser));
  assert.equal(day.body.can.fields, false);

  if (!isWorkingDay(today)) {
    assert.equal((await call("/reports/daily", { method: "POST", cookie: hosny, body: { values: {}, note: "" } })).status, 409);
    return;
  }
  // two earlier days in this quarter, then today's report: the item's value is their sum, and it adds up by period
  const earlier = today.endsWith("-01") ? [] : [`${month}-01`];
  for (const d of earlier) await prisma.dailyReport.create({ data: { userId: ids.hosnyUser, day: new Date(`${d}T00:00:00Z`), values: { [ids.sumKey]: 3 } } });
  assert.equal((await call("/reports/daily", { method: "POST", cookie: hosny, body: { values: { nope: 1 } } })).status, 400);
  const sent = await call("/reports/daily", { method: "POST", cookie: hosny, body: { values: { [ids.sumKey]: 4, [f.body.id]: 2 }, note: `${RUN} زرت 3 ملاك` } });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.onTime, true);
  assert.equal((await call("/reports/daily", { method: "POST", cookie: hosny, body: { values: {} } })).status, 409);
  assert.equal(Number((await prisma.kpiItem.findUniqueOrThrow({ where: { id: ids.sumItem } })).value), 4 + 3 * earlier.length);
  const after = (await call(`/reports/daily/day?userId=${ids.hosnyUser}&day=${today}`, { cookie: tlC })).body;
  assert.equal(after.form.status, "onTime");
  assert.equal(after.form.saved.values[f.body.id], 2);
  const row = after.rows.find((x: { title: string }) => x.title === `${RUN} عدد الملاك`);
  assert.deepEqual([row.day, row.month, row.quarter], [4, 4 + 3 * earlier.length, 4 + 3 * earlier.length]);
});

test("11.8 · targets: the TL sees his team only, 1.5M of 3M is 50%, a mid-month change waits for approval", async () => {
  assert.equal((await call("/reports/targets", { cookie: amr })).status, 403);
  assert.equal((await call("/reports/targets", { method: "PUT", cookie: tlC, body: { employeeId: ids.hosny, month, value: "1.00", deals: 1, visits: 1 } })).status, 403);
  const set = await call("/reports/targets", { method: "PUT", cookie: admin, body: { employeeId: ids.hosny, month, value: "3000000.00", deals: 2, visits: 10 } });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.pending, false); // the admin may approve: applies at once
  // a deal: Hosny the Buyer, Amr the Seller, 3M collected now → 1.5M each
  const unit = await prisma.unit.create({ data: { code: RUN, type: "Rent", project: RUN, area: "التجمع الخامس", space: 100, condition: "متشطب" } });
  const account = await prisma.account.findFirstOrThrow();
  const deal = await prisma.deal.create({ data: { code: RUN, unitId: unit.id, type: "Rent", space: 100, location: "x", company: RUN, source: "Referral", status: "PARTIALLY_COLLECTED",
    commissionOwner: 3_000_000, commissionClient: 0, closedAt: new Date(), createdById: ids.adminUser,
    participants: { create: [{ employeeId: ids.hosny, side: "BUYER" }, { employeeId: ids.amrEmp, side: "SELLER" }] },
    payments: { create: [{ side: "owner", amount: 3_000_000, receivedAt: new Date(), accountId: account.id, recordedById: ids.adminUser }] } } });
  Object.assign(ids, { unit: unit.id, deal: deal.id });
  const v = await call(`/reports/targets?month=${month}`, { cookie: tlC });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.ok(v.body.rows.length > 0);
  const team = await prisma.employee.findMany({ where: { teamLeaderId: ids.tlCEmp }, select: { id: true } });
  assert.ok(v.body.rows.every((r: { employeeId: string }) => team.some((t) => t.id === r.employeeId)));
  const h = v.body.rows.find((r: { employeeId: string }) => r.employeeId === ids.hosny);
  assert.deepEqual([h.value, h.achieved, h.percent, h.transactions, h.rank], ["3000000.00", "1500000.00", 50, 1, 1]);
  assert.equal(v.body.teams.length, 1);
  const tx = await call(`/reports/transactions?from=${month}-01&to=${today}`, { cookie: tlC });
  assert.ok(tx.body.some((r: { code: string }) => r.code === RUN));
  // a change waiting for approval: Nancy («reports: approve») accepts it, the TL can't
  await prisma.salesTarget.update({ where: { employeeId_month: { employeeId: ids.hosny, month } }, data: { pending: { value: "2000000.00", deals: 2, visits: 10, by: "test" } } });
  assert.equal((await call(`/reports/targets/${ids.hosny}/${month}/approve`, { method: "POST", cookie: tlC })).status, 403);
  assert.equal((await call(`/reports/targets/${ids.hosny}/${month}/approve`, { method: "POST", cookie: nancy })).status, 204);
  const t = await prisma.salesTarget.findUniqueOrThrow({ where: { employeeId_month: { employeeId: ids.hosny, month } } });
  assert.deepEqual([t.value.toFixed(2), t.pending], ["2000000.00", null]);
  assert.equal(await prisma.auditLog.count({ where: { module: "reports", entity: "SalesTarget", action: "approve", at: { gte: start } } }), 1);
});
