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
