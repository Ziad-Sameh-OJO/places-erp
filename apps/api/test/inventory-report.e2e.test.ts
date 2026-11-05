/**
 * 2.18 · the inventory's daily report (M-03 3.1) against the real database and API: the reports engine (11.10, the seeded
 * «التقرير اليومي للانفنتوري»: Manar approves, the management receives) counts the day by itself (once), Manar is told,
 * approves it once (the time is kept for her KPI), and its recipients get it.
 * Manar = inventory (approve), Randa = resale (no approve), Mohamed Mohsen = sales, Ahmed Islam = Super Admin.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { localDate } from "@places/domain";
import { pickPeople } from "@places/domain";
import { inventoryDayCounts, inventoryReportRun } from "../../worker/src/processors/inventory-report.ts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const now = new Date();
const today = localDate(now);
const date = new Date(`${today}T00:00:00Z`);
let manar: string, randa: string, sales: string, manarId: string, adminId: string;

before(async () => {
  [manar, randa, sales] = await Promise.all(["manar.ahmed@places.com", "randa.mohamed@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  [manarId, adminId] = await Promise.all(["manar.ahmed@places.com", "ahmed.islam@places.com"].map(async (email) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id));
  // a unit entered today, so «جديد» has at least one
  await prisma.unit.create({ data: { code: `U-R${stamp}`, type: "Rent", project: `E2E ${stamp} تقرير`, area: "التجمع الخامس", space: 120, condition: "متشطب" } });
  await prisma.inventoryReport.deleteMany({ where: { day: date } }); // this test owns today's report
});
after(async () => {
  const r = await prisma.inventoryReport.findUnique({ where: { day: date } });
  if (r) await prisma.auditLog.deleteMany({ where: { entity: "InventoryReport", entityId: r.id } });
  await prisma.inventoryReport.deleteMany({ where: { day: date } });
  await prisma.unit.deleteMany({ where: { code: `U-R${stamp}` } });
  await prisma.notification.deleteMany({ where: { text: { contains: "التقرير اليومي للانفنتوري" }, createdAt: { gte: now } } });
  await prisma.$disconnect();
});

test("before the end of the day there's no report yet (404 in Arabic)", async () => {
  const r = await call(`/inventory/daily-report?day=${today}`, { cookie: manar });
  assert.equal(r.status, 404);
  assert.match(JSON.stringify(r.body), /بيطلع لوحده في ميعاده/);
});

/** What the engine does at the report's time: its approvers and recipients, as set in «التقارير ومواعيدها». */
async function run() {
  const r = await prisma.scheduledReport.findUniqueOrThrow({ where: { id: "sr-inventory-daily" } });
  assert.equal(r.content, "inventory");
  const users = (await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, roles: { select: { role: { select: { key: true } } } } } }))
    .map((u) => ({ id: u.id, roles: u.roles.map((x) => x.role.key) }));
  await inventoryReportRun(r, today, now, pickPeople(r.preparedBy, users), pickPeople(r.recipients, users));
}

test("the engine counts the day by itself, once; Manar is told it waits for her", async () => {
  await run();
  await run(); // a retry changes nothing
  const reports = await prisma.inventoryReport.findMany({ where: { day: date } });
  assert.equal(reports.length, 1);
  // other test files add and remove units at the same time, so the numbers are checked for shape, and ours is in «جديد»
  const r = reports[0]!;
  assert.ok(r.newUnits >= 1, "the unit entered today");
  for (const n of [r.newUnits, r.updated, r.closed, r.unconfirmed]) assert.ok(Number.isInteger(n) && n >= 0);
  const counts = await inventoryDayCounts(today, now);
  assert.ok(counts.newUnits >= 1);
  const told = await prisma.notification.findMany({ where: { userId: manarId, text: { contains: "مستني اعتمادك" }, createdAt: { gte: now } } });
  assert.equal(told.length, 1, "told once");
});

test("only who approves sees it: Randa and sales 403", async () => {
  assert.equal((await call(`/inventory/daily-report?day=${today}`, { cookie: randa })).status, 403);
  assert.equal((await call(`/inventory/daily-report?day=${today}`, { cookie: sales })).status, 403);
  assert.equal((await call(`/inventory/daily-report/${today}/approve`, { method: "POST", cookie: randa })).status, 403);
  const r = await call(`/inventory/daily-report?day=${today}`, { cookie: manar });
  assert.equal(r.status, 200);
  assert.equal((r.body as { approvedAt: string | null }).approvedAt, null);
});

test("Manar approves once: the time is kept, the management gets the four numbers, audited", async () => {
  const r = await call(`/inventory/daily-report/${today}/approve`, { method: "POST", cookie: manar });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const body = r.body as { approvedAt: string; approvedBy: { name: string }; newUnits: number };
  assert.ok(body.approvedAt);
  assert.equal(body.approvedBy.name, "منار أحمد");
  assert.equal((await call(`/inventory/daily-report/${today}/approve`, { method: "POST", cookie: manar })).status, 400, "once");
  const sent = await prisma.notification.findFirst({ where: { userId: adminId, text: { startsWith: "التقرير اليومي للانفنتوري: جديد" }, createdAt: { gte: now } } });
  assert.match(sent?.text ?? "", new RegExp(`جديد ${body.newUnits} · متحدّث \\d+ · اتأجر / اتباع \\d+ · مش مؤكد \\d+`));
  const report = await prisma.inventoryReport.findUniqueOrThrow({ where: { day: date } });
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "InventoryReport", entityId: report.id, action: "approve" } }));
  assert.equal((await call("/inventory/daily-report/2026-13-01/approve", { method: "POST", cookie: manar })).status, 400);
  assert.equal((await call("/inventory/daily-report?day=2020-01-01", { cookie: manar })).status, 404);
});
