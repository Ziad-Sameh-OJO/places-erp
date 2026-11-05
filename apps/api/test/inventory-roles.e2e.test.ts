/**
 * 2.24 · the 5 Nov demo: Manar (Inventory Manager) has no M-10 (clients) in the API; Marwa (Inventory Specialist) opens
 * units but can't add one (more than view is the per-person override).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
let manar: string, marwa: string, unitId: string;

before(async () => {
  [manar, marwa] = await Promise.all(["manar.ahmed@places.com", "marwa.mostafa@places.com"].map((e) => session(e)));
  unitId = (await prisma.unit.create({ data: { code: `U-R${stamp}`, type: "Rent", project: `E2E roles ${stamp}`, area: "التجمع الخامس", space: 100, condition: "Finished", pdfStatus: "confirmed" } })).id; // a specialist sees what sales sees: confirmed units
});

after(async () => {
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.$disconnect();
});

test("the Inventory Manager gets 403 on clients & owners (M-10)", async () => {
  assert.equal((await call("/clients", { cookie: manar })).status, 403);
  assert.equal((await call("/clients/summary", { cookie: manar })).status, 403);
  assert.equal((await call(`/inventory/units/${unitId}`, { cookie: manar })).status, 200);
});

test("an Inventory Specialist opens a unit, and can't add one", async () => {
  const r = await call(`/inventory/units/${unitId}`, { cookie: marwa });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.code, `U-R${stamp}`);
  assert.equal((await call("/inventory/units", { cookie: marwa })).status, 200);
  assert.equal((await call("/inventory/units", { method: "POST", cookie: marwa, body: {} })).status, 403);
});
