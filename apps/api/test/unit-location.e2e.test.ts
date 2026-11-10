/**
 * 2.34 · a unit's Location is a Google Maps link, changed from its page («عدّل اللينك»): the old and new link go in the
 * Audit Log, the PDF waits for Manar's confirm again and the Last update is today. Sales and HR can't change it.
 * Manar = inventory, Mohamed Mohsen = sales, Basant = HR (no inventory).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const P = `E2E location ${Date.now()}`;
let manar: string, sales: string, hr: string;

before(async () => {
  [manar, sales, hr] = await Promise.all(["manar.ahmed@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
});
after(async () => {
  const units = await prisma.unit.findMany({ where: { project: { startsWith: P } }, select: { id: true } });
  const ids = units.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

const OLD = "30.02541, 31.49130", LINK = "https://maps.app.goo.gl/AbC123xyz";

test("«عدّل اللينك»: the old and new link in the Audit Log, the PDF back to draft, the Last update today", async () => {
  // a unit entered with the old map picker's coordinates, confirmed and last updated 40 days ago
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: { type: "Rent", project: `${P} Mivida`, space: 95, location: OLD, lastOwnerUpdateAt: "2026-01-01" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = (r.body as { id: string }).id;
  await prisma.unit.update({ where: { id }, data: { pdfStatus: "confirmed" } });

  const path = `/inventory/units/${id}/location`;
  // sales and HR may not change it (deny-by-default: inventory edit)
  assert.equal((await call(path, { method: "POST", cookie: sales, body: { location: LINK } })).status, 403);
  assert.equal((await call(path, { method: "POST", cookie: hr, body: { location: LINK } })).status, 403);
  // a link is https://…
  const bad = await call(path, { method: "POST", cookie: manar, body: { location: "maps google" } });
  assert.equal(bad.status, 400);
  assert.match(JSON.stringify(bad.body), /Google Maps/);

  const ok = await call(path, { method: "POST", cookie: manar, body: { location: LINK } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const u = ok.body as { location: string; pdfStatus: string; lastOwnerUpdateAt: string; stale: boolean };
  assert.equal(u.location, LINK);
  assert.equal(u.pdfStatus, "draft");
  assert.equal(u.stale, false);
  assert.ok(Date.now() - Date.parse(u.lastOwnerUpdateAt) < 60_000);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Unit", entityId: id, action: "location" } });
  assert.equal((audit.before as { location: string }).location, OLD);
  assert.equal((audit.after as { location: string }).location, LINK);

  // the same link again changes nothing (no second audit line)
  assert.equal((await call(path, { method: "POST", cookie: manar, body: { location: LINK } })).status, 200);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Unit", entityId: id, action: "location" } }), 1);
});
