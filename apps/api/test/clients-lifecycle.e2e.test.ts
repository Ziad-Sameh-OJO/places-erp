/**
 * 3.6 · M-10 3.3 / 6.1 / 3.1 / 2.3 against the real database: the daily job moves a file Inactive after a year without
 * dealing (controlled time, working days only, twice = no harm), the owners-needing-an-update report, the marketing
 * consent, and the data-deletion request to management. Mohamed Mohsen is a salesperson, Randa (Resale) keeps the inventory,
 * the accountant (finance) reads only.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { clientsInactiveTick } from "../../worker/src/processors/clients-inactive.ts";
import { call, mark, session } from "./helpers.ts";

const stamp = String(Date.now());
const P = `E2E life ${stamp}`; // own prefix: the clients files start in the same millisecond
mark(P); // a deletion request is mailed to the owners too
const phone = (n: number) => `0156${stamp.slice(-6)}${n}`; // own prefix: other e2e files use 010 / 011 / 012 + the same stamp
const DAY = 86_400_000;
let mohsen: string, randa: string, finance: string;
const ids: Record<string, string> = {};
const leadIds: string[] = [];
let unitId: string;
// Wednesday 4 Nov 2026 13:00 Cairo, a working day; Friday 6 Nov is the weekend
const WED = new Date("2026-11-04T11:00:00Z"), FRI = new Date("2026-11-06T11:00:00Z");

before(async () => {
  [mohsen, randa, finance] = await Promise.all(["m.mohsen@places.com", "randa.mohamed@places.com", "ahmed.ashraf@places.com"].map((e) => session(e)));
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  const mk = async (key: string, kind: "client" | "owner", n: number, lastContactAt: Date) =>
    (ids[key] = (await prisma.client.create({ data: { name: `${P} ${key}`, kind, lastContactAt, phones: { create: [{ phone: phone(n) }] } } })).id);
  await mk("old", "client", 1, new Date(WED.getTime() - 366 * DAY));
  await mk("recent", "client", 2, new Date(WED.getTime() - 300 * DAY));
  await mk("owner", "owner", 3, new Date());
  unitId = (await prisma.unit.create({ data: { code: `U-L${stamp}`, type: "Rent", project: `${P} مشروع`, area: "التجمع الخامس", space: 80, condition: "Finished", ownerId: ids.owner!, lastOwnerUpdateAt: new Date(Date.now() - 45 * DAY) } })).id;
  leadIds.push((await prisma.lead.create({ data: { code: `L-L${stamp}`, name: `${P} old`, phones: [phone(1)], area: "التجمع الخامس", type: "Rent", channel: "Facebook", assignedToId: emp.id, createdById: "e2e", clientId: ids.old! } })).id);
});

after(async () => {
  const all = Object.values(ids);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: all } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.client.deleteMany({ where: { id: { in: all } } });
  await prisma.$disconnect();
});

const status = async (key: string) => (await prisma.client.findUniqueOrThrow({ where: { id: ids[key]! } })).status;

test("the job: nothing on a Friday; on a working day a year without dealing goes Inactive (audited), 300 days stays; twice = no harm", async () => {
  await clientsInactiveTick(FRI);
  assert.equal(await status("old"), "active");
  await clientsInactiveTick(WED);
  assert.equal(await status("old"), "inactive");
  assert.equal(await status("recent"), "active");
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Client", entityId: ids.old!, action: "inactive" } }));
  await clientsInactiveTick(WED);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Client", entityId: ids.old!, action: "inactive" } }), 1);
});

test("dealing with them again makes the file Active; the list filters Inactive ones", async () => {
  const inactive = await call(`/clients?status=inactive&q=${encodeURIComponent(P)}`, { cookie: randa });
  assert.deepEqual(inactive.body.items.map((r: { id: string }) => r.id), [ids.old]);
  assert.equal((await call(`/clients/${ids.old}/interactions`, { method: "POST", cookie: mohsen, body: { kind: "مكالمة", text: `${P} رجع` } })).status, 201);
  assert.equal(await status("old"), "active");
});

test("the owners-needing-an-update report (M-10 6.1): owners with a unit over a month old", async () => {
  const r = await call(`/clients?stale=true&q=${encodeURIComponent(P)}`, { cookie: randa });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map((x: { id: string }) => x.id), [ids.owner]);
});

test("marketing consent (M-10 3.1): sales writes it on their client, audited; finance can't", async () => {
  assert.equal((await call(`/clients/${ids.old}`, { cookie: mohsen })).body.marketingConsent, null);
  assert.equal((await call(`/clients/${ids.old}/consent`, { method: "PUT", cookie: mohsen, body: { consent: true } })).status, 204);
  assert.equal((await call(`/clients/${ids.old}`, { cookie: mohsen })).body.marketingConsent, true);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Client", entityId: ids.old!, action: "update", after: { path: ["marketingConsent"], equals: true } } }));
  assert.equal((await call(`/clients/${ids.old}/consent`, { method: "PUT", cookie: finance, body: { consent: false } })).status, 403);
  assert.equal((await call(`/clients/${ids.recent}/consent`, { method: "PUT", cookie: mohsen, body: { consent: true } })).status, 404); // not his client
});

test("data deletion (M-10 2.3): the request is on the file, management hears it, once; nothing is erased", async () => {
  const r = await call(`/clients/${ids.old}/deletion-request`, { method: "POST", cookie: mohsen, body: { reason: `${P} العميل طلب في مكالمة` } });
  assert.equal(r.status, 204, JSON.stringify(r.body));
  const file = (await call(`/clients/${ids.old}`, { cookie: mohsen })).body;
  assert.equal(file.deletionAsked.reason, `${P} العميل طلب في مكالمة`);
  assert.deepEqual(file.phones, [phone(1)]);
  const admin = await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } } });
  assert.ok(await prisma.notification.findFirst({ where: { userId: admin.id, text: { contains: P } } }));
  assert.equal((await call(`/clients/${ids.old}/deletion-request`, { method: "POST", cookie: mohsen, body: { reason: "تاني" } })).status, 400);
  assert.equal((await call(`/clients/${ids.old}/deletion-request`, { method: "POST", cookie: finance, body: { reason: "مسح" } })).status, 403);
});
