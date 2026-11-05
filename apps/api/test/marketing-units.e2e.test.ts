/**
 * M-03 6.2 · 7.1 (M-04 4.4) end-to-end: Manar adds a unit → marketing gets the Live Alert at once and the unit is on
 * marketing's board → Done takes it off → Undo puts it back; audited; sales can't see the board.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const P = `E2E-MKU ${Date.now().toString(36)}`;
let manar: string, rahma: string, sales: string, rahmaId: string, agentId: string;

before(async () => {
  [manar, rahma, sales] = await Promise.all(["manar.ahmed@places.com", "rahma.hassan@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  rahmaId = (await prisma.user.findUniqueOrThrow({ where: { email: "rahma.hassan@places.com" } })).id;
});

after(async () => {
  const units = await prisma.unit.findMany({ where: { project: { startsWith: P } }, select: { id: true, ownerId: true } });
  const ids = units.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  const owners = [...new Set(units.flatMap((u) => (u.ownerId ? [u.ownerId] : [])))];
  const empty = await prisma.client.findMany({ where: { id: { in: owners }, units: { none: {} }, leads: { none: {} } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: empty.map((c) => c.id) } } });
  await prisma.client.deleteMany({ where: { id: { in: empty.map((c) => c.id) } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

test("a new unit → Live Alert to marketing and on its board → Done → off → Undo → back (M-03 7.1 · M-04 7.1)", async () => {
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: {
    type: "Rent", project: `${P} Mivida`, area: "التجمع الخامس", space: 95, condition: "متشطب", floor: "2", building: "B4", parking: 1,
    agentId, ownerName: "أ. سمير", ownerPhone: "0100 000 0101", pricePerSqm: "1100",
  } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id as string;
  const alert = await prisma.notification.findFirst({ where: { userId: rahmaId, text: { contains: P } } });
  assert.ok(alert, "Rahma got the Live Alert");
  assert.equal(alert!.link, "/marketing?tab=units");

  const board = async () => (await call("/marketing/new-units", { cookie: rahma })).body as Array<{ id: string; code: string }>;
  assert.ok((await board()).some((u) => u.id === id)); // a draft too: the shoot and the ads are prepared before the PDF is confirmed
  assert.equal((await call("/marketing/new-units", { cookie: sales })).status, 403);
  assert.equal((await call(`/marketing/new-units/${id}/done`, { method: "POST", cookie: sales })).status, 403);

  const done = await call(`/marketing/new-units/${id}/done`, { method: "POST", cookie: rahma });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.ok(!(await board()).some((u) => u.id === id));
  assert.equal((await call(`/marketing/new-units/${id}/done`, { method: "POST", cookie: rahma })).status, 400);

  assert.equal((await call(`/marketing/new-units/${id}/done`, { method: "DELETE", cookie: rahma })).status, 200);
  assert.ok((await board()).some((u) => u.id === id));
  assert.deepEqual((await prisma.auditLog.findMany({ where: { entity: "Unit", entityId: id, module: "marketing" }, orderBy: { at: "asc" } })).map((a) => a.action), ["marketing-done", "marketing-undo"]);
  assert.equal((await call("/marketing/new-units/nope/done", { method: "POST", cookie: rahma })).status, 404);
});
