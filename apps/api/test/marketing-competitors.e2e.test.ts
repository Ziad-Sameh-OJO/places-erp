/**
 * M-04 · the marketing dashboard's «تقرير المنافسين الشهري» card (4.11): marketing sees whether this month's report is
 * handed in; sales don't get in. Rahma (the one the seeded report names) hands it in with its file name / link and the
 * card says «اتسلّم الشهر ده». Whatever this file hands in is removed in `after`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const start = new Date();
const NOTE = `E2E-COMP-${Date.now()} تقرير المنافسين.pdf`;
let rahma: string, sales: string, hosny: string;

before(async () => {
  [rahma, sales, hosny] = await Promise.all(["rahma.hassan@places.com", "anas@places.com", "youssef.hosny@places.com"].map((e) => session(e)));
});

after(async () => {
  await prisma.kpiDelivery.deleteMany({ where: { item: { report: "sr-competitors" }, at: { gte: start } } });
  await prisma.reportHandIn.deleteMany({ where: { reportId: "sr-competitors", at: { gte: start } } });
  await prisma.notification.deleteMany({ where: { link: "/reports", createdAt: { gte: start }, text: { contains: "تقرير المنافسين" } } });
  await prisma.auditLog.deleteMany({ where: { module: "reports", entityId: "sr-competitors", at: { gte: start } } });
  await prisma.competitor.deleteMany({ where: { name: { startsWith: "E2E-COMP" } } });
  await prisma.$disconnect();
});

test("sales get 403 on the card", async () => {
  assert.equal((await call("/marketing/competitors-report", { cookie: sales })).status, 403);
});

test("Rahma sees the card, hands this month's report in with its name, and it says «اتسلّم الشهر ده»", async () => {
  const r = await call("/marketing/competitors-report", { cookie: rahma });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const card = r.body.card;
  assert.equal(card.name, "تقرير المنافسين الشهري");
  assert.equal(card.canHandIn, true);
  // only the one the report names hands it in
  assert.equal((await call(`/reports/scheduled/${card.id}/hand-in`, { method: "POST", cookie: hosny, body: { note: NOTE } })).status, 403);
  if (card.state === "done") return; // already handed in this month (another run of the reports e2e)
  const ok = await call(`/reports/scheduled/${card.id}/hand-in`, { method: "POST", cookie: rahma, body: { note: NOTE } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const seen = (await call("/marketing/competitors-report", { cookie: rahma })).body.card;
  assert.equal(seen.state, "done");
  assert.equal(seen.recent[0].note, NOTE);
  assert.equal(await prisma.auditLog.count({ where: { module: "reports", entity: "ReportHandIn", entityId: card.id, at: { gte: start } } }), 1);
});

test("14.14: the report's competitors — Rahma adds one, rates it «قوي», sales can't see or touch it; every change audited", async () => {
  const month = "2026-11", name = `E2E-COMP-${Date.now()} شركة منافسة`;
  assert.equal((await call(`/marketing/competitors-report/rows?month=${month}`, { cookie: sales })).status, 403);
  assert.equal((await call("/marketing/competitors-report/rows", { method: "POST", cookie: sales, body: { month, name } })).status, 403);
  assert.equal((await call(`/marketing/competitors-report/rows?month=2026-13`, { cookie: rahma })).status, 400);
  const r = await call("/marketing/competitors-report/rows", { method: "POST", cookie: rahma, body: { month, name, note: "نزلوا 3 إعلانات للتجمع" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id as string;
  assert.equal(r.body.strong, null);
  assert.equal((await call("/marketing/competitors-report/rows", { method: "POST", cookie: rahma, body: { month, name } })).status, 409);
  assert.equal((await call(`/marketing/competitors-report/rows/${id}`, { method: "PATCH", cookie: sales, body: { strong: true } })).status, 403);
  const rated = await call(`/marketing/competitors-report/rows/${id}`, { method: "PATCH", cookie: rahma, body: { strong: true } });
  assert.equal(rated.status, 200, JSON.stringify(rated.body));
  const rows = (await call(`/marketing/competitors-report/rows?month=${month}`, { cookie: rahma })).body as { id: string; strong: boolean | null }[];
  assert.equal(rows.find((x) => x.id === id)?.strong, true);
  assert.equal((await call(`/marketing/competitors-report/rows/${id}`, { method: "DELETE", cookie: rahma })).status, 204);
  assert.equal((await call(`/marketing/competitors-report/rows/${id}`, { method: "PATCH", cookie: rahma, body: { strong: false } })).status, 404);
  assert.deepEqual((await prisma.auditLog.findMany({ where: { entity: "Competitor", entityId: id }, orderBy: { at: "asc" } })).map((a) => a.action), ["create", "rate", "delete"]);
  await prisma.auditLog.deleteMany({ where: { entity: "Competitor", entityId: id } });
});
