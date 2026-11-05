/**
 * 2.11 · M-10 2.1 steps 3–4: Manar enters a unit with its owner's number → the owner's file is made with that first
 * unit; the owner's next unit joins the same file (the number written any way); a client's number makes them «both»;
 * a changed number moves the unit to that number's file. Sales can't add units (403).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const P = `E2E owners ${stamp}`; // own prefix: the clients files start in the same millisecond
const phone = (n: number) => `0155${stamp.slice(-6)}${n}`; // own prefix: other e2e files use 010 / 011 / 012 + the same stamp
let manar: string, sales: string, agentId: string, clientId: string;
const unitIds: string[] = [];

before(async () => {
  [manar, sales] = await Promise.all(["manar.ahmed@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  clientId = (await prisma.client.create({ data: { name: `${P} عميل قديم`, kind: "client", phones: { create: [{ phone: phone(3) }] } } })).id;
});

after(async () => {
  const files = await prisma.client.findMany({ where: { OR: [{ id: clientId }, { phones: { some: { phone: { in: [phone(1), phone(2), phone(3)] } } } }] }, select: { id: true } });
  const ids = files.map((f) => f.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...unitIds] } } });
  await prisma.unit.deleteMany({ where: { id: { in: unitIds } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

const rent = (extra: object) => ({
  type: "Rent", project: `${P} مشروع`, area: "التجمع الخامس", space: 95, condition: "متشطب", building: "B4", parking: 0,
  agentId, ownerName: `${P} أ. سمير`, ownerPhone: phone(1), pricePerSqm: "1100", ...extra,
});
const add = async (body: object) => {
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  unitIds.push(r.body.id);
  return r.body.id as string;
};
const ownerOf = async (unitId: string) => (await prisma.unit.findUniqueOrThrow({ where: { id: unitId }, select: { ownerId: true } })).ownerId;

test("sales can't add a unit (so can't make an owner)", async () => {
  assert.equal((await call("/inventory/units", { method: "POST", cookie: sales, body: rent({}) })).status, 403);
});

test("the first unit makes the owner's file; the second unit (number written differently) joins it; both show in the file", async () => {
  const first = await add(rent({}));
  const owner = await ownerOf(first);
  assert.ok(owner);
  const second = await add(rent({ space: 120, ownerPhone: `+2 ${phone(1).slice(0, 4)} ${phone(1).slice(4)}` }));
  assert.equal(await ownerOf(second), owner);
  const file = (await call(`/clients/${owner}`, { cookie: manar })).body;
  assert.equal(file.kind, "owner");
  assert.equal(file.name, `${P} أ. سمير`);
  assert.deepEqual(file.phones, [phone(1)]);
  assert.deepEqual(file.units.map((u: { id: string }) => u.id).sort(), [first, second].sort());
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Client", entityId: owner!, action: "create" } }));
});

test("an old client who brings a unit becomes «عميل + مالك» on the same file", async () => {
  const u = await add(rent({ ownerPhone: phone(3), ownerName: "اسم تاني" }));
  assert.equal(await ownerOf(u), clientId);
  const file = (await call(`/clients/${clientId}`, { cookie: manar })).body;
  assert.equal(file.kind, "both");
  assert.equal(file.name, `${P} عميل قديم`); // the file keeps its name
});

test("a changed owner number moves the unit to that number's file (made if new)", async () => {
  const u = unitIds[0]!;
  const before = await ownerOf(u);
  const r = await call(`/inventory/units/${u}`, { method: "PUT", cookie: manar, body: rent({ ownerPhone: phone(2), ownerName: `${P} أ. نادر` }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = await ownerOf(u);
  assert.ok(after && after !== before);
  assert.equal((await prisma.client.findUniqueOrThrow({ where: { id: after } })).name, `${P} أ. نادر`);
});
