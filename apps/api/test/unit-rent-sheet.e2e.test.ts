/**
 * 2.21 · the Rent sheet like the client's (Book7): a unit saves with the project only, and the new columns (Layout,
 * Comment) and the rent terms the PDF shows (Delivery · Upfront · Security · Payment · Term · Grace · Annual increase)
 * are saved, edited and audited. Manar = inventory, Mohamed Mohsen = sales (can't add units).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, mark, session } from "./helpers.ts";

const P = `E2E rent sheet ${Date.now()}`;
let manar: string, sales: string;

before(async () => {
  [manar, sales] = await Promise.all(["manar.ahmed@places.com", "m.mohsen@places.com"].map((e) => session(e)));
});
after(async () => {
  const ids = (await prisma.unit.findMany({ where: { project: { startsWith: P } }, select: { id: true } })).map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

type Unit = { id: string; project: string; space: number; area: string; condition: string; layout: boolean; comment: string | null; details: Record<string, unknown>; missing: string[]; agent: unknown };

test("sales can't add a unit", async () => {
  assert.equal((await call("/inventory/units", { method: "POST", cookie: sales, body: { type: "Rent", project: `${P} no` } })).status, 403);
});

test("a Rent unit saves with the project only, and with nothing at all", async () => {
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: { type: "Rent", project: `${P} only` } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const u = (await call(`/inventory/units/${(r.body as { id: string }).id}`, { cookie: manar })).body as Unit;
  assert.equal(u.space, 0);
  assert.equal(u.agent, null);
  assert.deepEqual(u.missing, ["Pic & Info", "Area", "Conditions", "Price/Sqm", "Maintenance", "Commission", "Building Number", "Location", "Contact", "Number"]);
  const bare = await call("/inventory/units", { method: "POST", cookie: manar, body: { type: "Rent" } });
  assert.equal(bare.status, 201, JSON.stringify(bare.body));
  mark(`وحدة جديدة ${(bare.body as { code: string }).code} (`); // its Live Alert has no project to find it by
  await prisma.unit.update({ where: { id: (bare.body as { id: string }).id }, data: { project: `${P} bare` } }); // so after() finds it
});

test("the new columns and the rent terms are saved and edited (audited)", async () => {
  const terms = { delivery: "Ready to move", upfront: "3 months", security: "3 months", payment: "Quarterly", term: "3-5 years", grace: "N\\A", escalationPct: 10 };
  const body = { type: "Rent", project: `${P} P1901`, space: 690, divisible: true, minSplit: 20, maintenance: "Included", commission: "1 month", layout: true, comment: "الدور كامل", ...terms };
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = (r.body as { id: string }).id;
  const u = (await call(`/inventory/units/${id}`, { cookie: manar })).body as Unit;
  assert.equal(u.layout, true);
  assert.equal(u.comment, "الدور كامل");
  assert.deepEqual(u.details, terms);

  const put = await call(`/inventory/units/${id}`, { method: "PUT", cookie: manar, body: { ...body, layout: false, comment: "", upfront: "2 months", escalationPct: 12 } });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const e = put.body as Unit;
  assert.equal(e.layout, false);
  assert.equal(e.comment, null);
  assert.equal(e.details.upfront, "2 months");
  assert.equal(e.details.escalationPct, 12);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Unit", entityId: id, action: "update" } });
  assert.match(JSON.stringify(audit.after), /2 months/);
  assert.match(JSON.stringify(audit.after), /"layout":false/);
});
