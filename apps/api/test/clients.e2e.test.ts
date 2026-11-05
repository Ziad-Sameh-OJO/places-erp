/**
 * 3.2 · the client file (M-10) against the real API and database: a Done Deal makes the client's file, a number that's
 * already on a file joins it (M-10 2.1 · 7.1), a new lead with an old client's number is linked to the file (2.3),
 * paid and remaining (3.2), the contact log. Mohamed Mohsen is a salesperson (own scope), Mohamed Eid another one,
 * Manar keeps the inventory, Basant is HR (no clients).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const P = `E2E file ${stamp}`; // own prefix: the clients files start in the same millisecond
const phone = (n: number) => `0159${stamp.slice(-6)}${n}`; // own prefix: other e2e files use 010 / 011 / 012 + the same stamp
let mohsen: string, eid: string, manar: string, hr: string;
const leadIds: string[] = [];
let unitId: string, ownerId: string;

before(async () => {
  [mohsen, eid, manar, hr] = await Promise.all(["m.mohsen@places.com", "m.eid@places.com", "manar.ahmed@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  // an owner already on file with one unit (2.11 makes these from the inventory form; here by hand)
  const owner = await prisma.client.create({ data: { name: `${P} مالك`, kind: "owner", phones: { create: [{ phone: phone(9) }] } } });
  ownerId = owner.id;
  unitId = (await prisma.unit.create({ data: { code: `U-C${stamp}`, type: "Rent", project: `${P} مشروع`, area: "التجمع الخامس", space: 120, condition: "Finished", ownerId, ownerName: owner.name, ownerPhone: phone(9) } })).id;
});

after(async () => {
  const clients = await prisma.client.findMany({ where: { name: { startsWith: P } }, select: { id: true } });
  const ids = clients.map((c) => c.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...ids, ...leadIds] } }, { entity: "ClientInteraction", at: { gte: new Date(Number(stamp)) } }] } });
  await prisma.payment.deleteMany({ where: { deal: { code: { startsWith: `D-C${stamp}` } } } });
  await prisma.deal.deleteMany({ where: { code: { startsWith: `D-C${stamp}` } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.unit.deleteMany({ where: { code: { startsWith: `U-C${stamp}` } } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

const newLead = async (cookie: string, n: number, extra: object = {}) => {
  const r = await call("/leads", { method: "POST", cookie, body: { name: `${P} عميل ${n}`, phones: [phone(n)], area: "التجمع الخامس", type: "Rent", channel: "Facebook", keep: true, ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  leadIds.push(r.body.id);
  return r.body.id as string;
};
const stage = (cookie: string, id: string, s: string) => call(`/leads/${id}/stage`, { method: "PATCH", cookie, body: { stage: s } });

test("only the roles with the clients page: HR gets 403", async () => {
  assert.equal((await call("/clients", { cookie: hr })).status, 403);
  assert.equal((await call(`/clients/${ownerId}`, { cookie: hr })).status, 403);
});

test("Done Deal makes the client's file with the lead's numbers (M-10 2.1)", async () => {
  const id = await newLead(mohsen, 1);
  assert.equal((await stage(mohsen, id, "Done Deal")).status, 200);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id }, select: { clientId: true } });
  assert.ok(lead.clientId);
  const file = await call(`/clients/${lead.clientId}`, { cookie: mohsen });
  assert.equal(file.status, 200, JSON.stringify(file.body));
  assert.equal(file.body.kind, "client");
  assert.deepEqual(file.body.phones, [phone(1)]);
  assert.deepEqual(file.body.leads.map((l: { id: string }) => l.id), [id]);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Client", entityId: lead.clientId!, action: "create" } }));
  // the same lead moved again doesn't make a second file
  await stage(mohsen, id, "Hold");
  await stage(mohsen, id, "Done Deal");
  assert.equal(await prisma.client.count({ where: { phones: { some: { phone: phone(1) } } } }), 1);
});

test("an owner whose number closes a deal joins their old file: owner → both (M-10 7.1)", async () => {
  const id = await newLead(mohsen, 9);
  assert.equal((await stage(mohsen, id, "Done Deal")).status, 200);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id }, select: { clientId: true } });
  assert.equal(lead.clientId, ownerId);
  const file = (await call(`/clients/${ownerId}`, { cookie: manar })).body;
  assert.equal(file.kind, "both");
  assert.equal(file.units.length, 1);
  assert.equal(file.units[0].code, `U-C${stamp}`);
});

test("a new lead with an old client's number is linked to the file (M-10 2.3)", async () => {
  const first = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[0]! }, select: { clientId: true } });
  // the old lead is archived (closed); the client comes back with a new one
  await prisma.lead.update({ where: { id: leadIds[0]! }, data: { archivedAt: new Date() } });
  const again = await newLead(mohsen, 1);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: again }, select: { clientId: true } })).clientId, first.clientId);
});

test("scope: a salesperson sees their own clients only; inventory sees owners", async () => {
  const mine = await call(`/clients?q=${encodeURIComponent(P)}`, { cookie: mohsen });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.total, 2);
  const other = await call(`/clients?q=${encodeURIComponent(P)}`, { cookie: eid });
  assert.equal(other.body.total, 0);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[0]! }, select: { clientId: true } });
  assert.equal((await call(`/clients/${lead.clientId}`, { cookie: eid })).status, 404);
  const owners = await call(`/clients?kind=owner&q=${encodeURIComponent(P)}`, { cookie: manar });
  assert.deepEqual(owners.body.items.map((r: { id: string }) => r.id), [ownerId]);
  // search by number, written any way
  const byPhone = await call(`/clients?q=${encodeURIComponent(`+2${phone(9)}`)}`, { cookie: manar });
  assert.deepEqual(byPhone.body.items.map((r: { id: string }) => r.id), [ownerId]);
});

test("paid and remaining (M-10 3.2): the client's commission against the client's collections", async () => {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[1]! }, select: { clientId: true } });
  const account = await prisma.account.findFirstOrThrow({ select: { id: true } });
  await prisma.deal.create({ data: {
    code: `D-C${stamp}1`, leadId: leadIds[1]!, unitId, type: "Rent", space: 120, location: "التجمع", company: `${P}`, source: "Facebook",
    status: "PARTIALLY_COLLECTED", commissionOwner: "10000", commissionClient: "12000", closedAt: new Date(), createdById: "e2e",
    payments: { create: [{ side: "client", amount: "5000", receivedAt: new Date(), accountId: account.id, recordedById: "e2e" }, { side: "owner", amount: "10000", receivedAt: new Date(), accountId: account.id, recordedById: "e2e" }] },
  } });
  // the owner (same person here: «both») is the client on this deal and the owner of its unit
  const file = (await call(`/clients/${lead.clientId}`, { cookie: manar })).body;
  assert.equal(file.deals.length, 1);
  assert.equal(file.deals[0].side, "client");
  assert.equal(file.balance.paid, "5000.00");
  assert.equal(file.balance.remaining, "7000.00");
});

test("the contact log: sales logs on their client, it shows in the timeline and is audited; a kind not on the list is refused", async () => {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[0]! }, select: { clientId: true } });
  const r = await call(`/clients/${lead.clientId}/interactions`, { method: "POST", cookie: mohsen, body: { kind: "مكالمة", text: `${P} كلمته عن التجديد` } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "ClientInteraction", entityId: r.body.id, action: "create" } }));
  const file = (await call(`/clients/${lead.clientId}`, { cookie: mohsen })).body;
  assert.equal(file.timeline[0].text, `مكالمة: ${P} كلمته عن التجديد`);
  assert.equal((await call(`/clients/${lead.clientId}/interactions`, { method: "POST", cookie: mohsen, body: { kind: "حاجة تانية", text: "x" } })).status, 400);
  assert.equal((await call(`/clients/${lead.clientId}/interactions`, { method: "POST", cookie: eid, body: { kind: "مكالمة", text: "x" } })).status, 404);
});

test("«ابديت مع المالك» is the owner's update: their units' last update is today (demo clients.js · M-10 2.4)", async () => {
  await prisma.unit.update({ where: { id: unitId }, data: { lastOwnerUpdateAt: new Date(Date.now() - 50 * 86_400_000) } });
  assert.equal((await call(`/clients/${ownerId}`, { cookie: manar })).body.units[0].stale, true);
  const r = await call(`/clients/${ownerId}/interactions`, { method: "POST", cookie: manar, body: { kind: "ابديت مع المالك", text: `${P} لسه متاحة بنفس السعر` } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await call(`/clients/${ownerId}`, { cookie: manar })).body.units[0].stale, false);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: unitId, action: "update", userId: { not: null }, at: { gte: new Date(Number(stamp)) } } }));
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: unitId } });
});
