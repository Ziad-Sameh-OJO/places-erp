/**
 * 10.4 · the office assets register and the office boys' rota (M-08 3.1) against the real API and database:
 * Mokhtar (procurement edit) keeps them, Nancy (approver: procurement view) only reads, Basant (HR) has no
 * procurement at all. Every change is audited; the monthly review shows as «reviewed this month».
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const P = `E2E ${Date.now()}`;
let mokhtar: string, nancy: string, hr: string;
const reviewIds: string[] = [];

before(async () => {
  [mokhtar, nancy, hr] = await Promise.all(["mokhtar.gamal@places.com", "nancy.islam@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
});
after(async () => {
  const assets = (await prisma.officeAsset.findMany({ where: { name: { startsWith: P } }, select: { id: true } })).map((a) => a.id);
  const shifts = (await prisma.officeBoyShift.findMany({ where: { area: { startsWith: P } }, select: { id: true } })).map((s) => s.id);
  const ids = [...assets, ...shifts, ...reviewIds];
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.officeAsset.deleteMany({ where: { id: { in: assets } } });
  await prisma.officeBoyShift.deleteMany({ where: { id: { in: shifts } } });
  await prisma.officeAssetReview.deleteMany({ where: { id: { in: reviewIds } } });
  await prisma.$disconnect();
});

test("the assets register: Mokhtar adds, changes, reviews and removes; Nancy reads; HR is refused", async () => {
  assert.equal((await call("/procurement/office-assets", { cookie: hr })).status, 403);
  assert.equal((await call("/procurement/office-assets", { method: "POST", cookie: nancy, body: { name: `${P} لابتوب` } })).status, 403);
  assert.equal((await call("/procurement/office-assets/review", { method: "POST", cookie: nancy })).status, 403);

  const made = await call("/procurement/office-assets", { method: "POST", cookie: mokhtar, body: { name: `${P} لابتوب Dell × 14`, place: "المبيعات" } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.needsRepair, false); // a new asset is «سليم», as in the demo
  const id = made.body.id as string;

  const missing = await call("/procurement/office-assets", { method: "POST", cookie: mokhtar, body: { name: "  ", place: "x" } });
  assert.equal(missing.status, 400);
  assert.match(JSON.stringify(missing.body), /اسم الأصل/);

  // Nancy sees it; she can't change or remove it
  const seen = (await call("/procurement/office-assets", { cookie: nancy })).body as { items: Array<{ id: string; place: string }> };
  assert.equal(seen.items.find((a) => a.id === id)?.place, "المبيعات");
  assert.equal((await call(`/procurement/office-assets/${id}`, { method: "PATCH", cookie: nancy, body: { name: `${P} x` } })).status, 403);
  assert.equal((await call(`/procurement/office-assets/${id}`, { method: "DELETE", cookie: nancy })).status, 403);

  const fixed = await call(`/procurement/office-assets/${id}`, { method: "PATCH", cookie: mokhtar, body: { name: `${P} لابتوب Dell × 14`, place: "المبيعات", needsRepair: true } });
  assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
  assert.equal(fixed.body.needsRepair, true);
  assert.equal((await call("/procurement/office-assets/nope", { method: "PATCH", cookie: mokhtar, body: { name: `${P} y` } })).status, 404);

  // the monthly review: by Mokhtar, shown with his name, counts for this month
  const review = await call("/procurement/office-assets/review", { method: "POST", cookie: mokhtar });
  assert.equal(review.status, 201, JSON.stringify(review.body));
  const reg = (await call("/procurement/office-assets", { cookie: nancy })).body as { reviewedThisMonth: boolean; lastReview: { at: string; by: string } };
  assert.equal(reg.reviewedThisMonth, true);
  assert.equal(reg.lastReview.by, "مختار جمال");
  reviewIds.push(review.body.id as string);

  assert.equal((await call(`/procurement/office-assets/${id}`, { method: "DELETE", cookie: mokhtar })).status, 204);
  const after = (await call("/procurement/office-assets", { cookie: mokhtar })).body as { items: Array<{ id: string }> };
  assert.ok(!after.items.some((a) => a.id === id)); // off the register, kept (archived) for the trail
  assert.ok(await prisma.officeAsset.findUnique({ where: { id } }));
  assert.equal((await call(`/procurement/office-assets/${id}`, { method: "DELETE", cookie: mokhtar })).status, 404);
  assert.deepEqual((await prisma.auditLog.findMany({ where: { entity: "OfficeAsset", entityId: id }, select: { action: true }, orderBy: { at: "asc" } })).map((a) => a.action), ["create", "update", "delete"]);
  assert.equal(await prisma.auditLog.count({ where: { entity: "OfficeAssetReview", entityId: { in: reviewIds } } }), reviewIds.length);
});

test("the office boys' rota by area: Mokhtar keeps it, Nancy reads it, HR is refused", async () => {
  const row = { area: `${P} الدور الأرضي + الاستقبال`, name: "سيد", slots: "9:00 · 13:00 · 17:00" };
  assert.equal((await call("/procurement/office-boys", { cookie: hr })).status, 403);
  assert.equal((await call("/procurement/office-boys", { method: "POST", cookie: nancy, body: row })).status, 403);

  const made = await call("/procurement/office-boys", { method: "POST", cookie: mokhtar, body: row });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.id as string;
  const bad = await call("/procurement/office-boys", { method: "POST", cookie: mokhtar, body: { ...row, slots: "" } });
  assert.equal(bad.status, 400);
  assert.match(JSON.stringify(bad.body), /المواعيد/);

  const list = (await call("/procurement/office-boys", { cookie: nancy })).body as Array<{ id: string; slots: string }>;
  assert.equal(list.find((s) => s.id === id)?.slots, row.slots);

  assert.equal((await call(`/procurement/office-boys/${id}`, { method: "PATCH", cookie: nancy, body: row })).status, 403);
  const moved = await call(`/procurement/office-boys/${id}`, { method: "PATCH", cookie: mokhtar, body: { ...row, slots: "قبل كل اجتماع" } });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.slots, "قبل كل اجتماع");

  assert.equal((await call(`/procurement/office-boys/${id}`, { method: "DELETE", cookie: nancy })).status, 403);
  assert.equal((await call(`/procurement/office-boys/${id}`, { method: "DELETE", cookie: mokhtar })).status, 204);
  assert.equal((await call(`/procurement/office-boys/${id}`, { method: "DELETE", cookie: mokhtar })).status, 404);
  assert.deepEqual((await prisma.auditLog.findMany({ where: { entity: "OfficeBoyShift", entityId: id }, select: { action: true }, orderBy: { at: "asc" } })).map((a) => a.action), ["create", "update", "delete"]);
});
