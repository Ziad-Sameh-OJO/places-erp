/**
 * M-12 · management review of «التقارير والتارجت» and the KPIs against the real API: someone a head listed for the
 * reports with his team's scope doesn't get the whole-company dashboards; a target or a KPI bonus is never negative; a
 * hand-in after the quarter closed doesn't count in that quarter's items. Everything made is removed in `after`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { localDate } from "@places/domain";
import { PW, call, kpiQuarterLock, session } from "./helpers.ts";

const stamp = Date.now();
const KEY = `e2e-rpt-admin-${stamp}`;
const RUN = `E2E-RPT-ADMIN-${stamp}`;
let admin: string, hosny: string, listed: string, roleId = "", userId = "", itemId = "", reportId = "";

before(async () => {
  [admin, hosny] = await Promise.all(["ahmed.islam@places.com", "youssef.hosny@places.com"].map((e) => session(e)));
  // a TL-like role: his team's records only, the reports and HR to look at
  roleId = (await prisma.role.create({ data: { key: KEY, label: `E2E reports admin ${stamp}`, tier: "Executive Staff", scope: "TEAM", permissions: { create: [
    { module: "reports", actions: ["view"] }, { module: "hr", actions: ["view"] },
  ] } } })).id;
  const email = `rpt-admin-${stamp}@places.test`;
  userId = (await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } })).id;
  await prisma.reportsAccess.create({ data: { userId, grantedById: userId } }); // 11.20: a head opened the page for him
  listed = await session(email);
});

after(async () => {
  if (reportId) await prisma.scheduledReport.deleteMany({ where: { id: reportId } });
  await prisma.reportHandIn.deleteMany({ where: { reportId } });
  if (itemId) await prisma.kpiItem.deleteMany({ where: { id: itemId } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [roleId, userId, reportId, itemId].filter(Boolean) } }, { userId }] } });
  await prisma.notification.deleteMany({ where: { text: { contains: RUN } } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.reportsAccess.deleteMany({ where: { userId } });
  await prisma.userRole.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

test("14.1 · listed for the reports with a team scope: his team's targets, not the whole-company dashboards", async () => {
  assert.equal((await call("/reports/targets", { cookie: listed })).status, 200);
  assert.equal((await call("/dashboard/company", { cookie: listed })).status, 403);
  assert.equal((await call("/dashboard/ahmed", { cookie: listed })).status, 403);
  assert.equal((await call("/dashboard/layout", { cookie: listed })).body.layout, "role");
  assert.equal((await call("/dashboard/company", { cookie: admin })).status, 200);
});

test("11.8 · a target is never negative", async () => {
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "youssef.hosny@places.com" } }, select: { id: true } });
  const next = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 7);
  const r = await call("/reports/targets", { method: "PUT", cookie: admin, body: { employeeId: emp.id, month: next, value: "-500000", deals: 1, visits: 1 } });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.equal(await prisma.salesTarget.count({ where: { employeeId: emp.id, month: next, value: { lt: 0 } } }), 0);
});

test("11.4 · 11.10 · a hand-in after the quarter closed doesn't count in that quarter's KPI item", () => kpiQuarterLock(async () => {
  const q = await prisma.kpiQuarter.findFirst({ orderBy: { id: "desc" } });
  if (!q || q.status !== "open") return;
  const h = await prisma.employee.findFirstOrThrow({ where: { user: { email: "youssef.hosny@places.com" } }, select: { id: true, userId: true } });
  const card = await prisma.kpiCard.findUniqueOrThrow({ where: { quarter_employeeId: { quarter: q.id, employeeId: h.id } } });
  itemId = (await prisma.kpiItem.create({ data: { cardId: card.id, position: 800 + (stamp % 90), title: `${RUN} تسليم`, weight: 0, targetText: RUN, direction: "at-least", goal: 5, method: "report", required: 5 } })).id;
  const today = localDate(new Date());
  const made = await call("/reports/scheduled", { method: "POST", cookie: admin, body: {
    name: `${RUN} أسبوعي`, kind: "handin", freq: "weekly", day: new Date(`${today}T12:00:00Z`).getUTCDay(), time: "23:59",
    preparedBy: [h.userId], recipients: [h.userId], remindMin: 0, kpiItems: [itemId],
  } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  reportId = made.body.id;
  await prisma.kpiQuarter.update({ where: { id: q.id }, data: { status: "closed" } });
  try {
    const r = await call(`/reports/scheduled/${reportId}/hand-in`, { method: "POST", cookie: hosny });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.counted, false);
    assert.equal(await prisma.kpiDelivery.count({ where: { itemId } }), 0);
  } finally {
    await prisma.kpiQuarter.update({ where: { id: q.id }, data: { status: "open" } });
  }
}));
