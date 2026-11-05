/**
 * 3.5 · M-10 4.1 against the real API: an owner's numbers never reach sales (the response itself, not just the
 * screen); finance reads every file and its balance but changes nothing. Mohamed Mohsen is a salesperson, Manar keeps
 * the inventory, Ahmed Ashraf is the accountant.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const P = `E2E perm ${stamp}`; // own prefix: the clients files start in the same millisecond
const phone = (n: number) => `0157${stamp.slice(-6)}${n}`; // own prefix: other e2e files use 010 / 011 / 012 + the same stamp
let mohsen: string, manar: string, finance: string;
let ownerFile: string, clientFile: string;
const leadIds: string[] = [];

before(async () => {
  [mohsen, manar, finance] = await Promise.all(["m.mohsen@places.com", "manar.ahmed@places.com", "ahmed.ashraf@places.com"].map((e) => session(e)));
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  ownerFile = (await prisma.client.create({ data: { name: `${P} مالك وعميل`, kind: "both", phones: { create: [{ phone: phone(1) }] } } })).id;
  clientFile = (await prisma.client.create({ data: { name: `${P} عميل`, kind: "client", phones: { create: [{ phone: phone(2) }] } } })).id;
  for (const [n, clientId] of [[1, ownerFile], [2, clientFile]] as const) {
    leadIds.push((await prisma.lead.create({ data: { code: `L-P${stamp}${n}`, name: `${P} ${n}`, phones: [phone(n)], area: "التجمع الخامس", type: "Rent", channel: "Facebook", assignedToId: emp.id, createdById: "e2e", clientId } })).id);
  }
});

after(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.client.deleteMany({ where: { id: { in: [ownerFile, clientFile] } } });
  await prisma.$disconnect();
});

test("sales: the owner's number isn't in the list or the file response at all; their client's number is", async () => {
  const list = await call(`/clients?q=${encodeURIComponent(P)}`, { cookie: mohsen });
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 2);
  assert.ok(!JSON.stringify(list.body).includes(phone(1)));
  assert.equal(list.body.items.find((r: { id: string }) => r.id === ownerFile).phones, null);
  assert.deepEqual(list.body.items.find((r: { id: string }) => r.id === clientFile).phones, [phone(2)]);
  const file = await call(`/clients/${ownerFile}`, { cookie: mohsen });
  assert.equal(file.status, 200);
  assert.ok(!JSON.stringify(file.body).includes(phone(1)));
});

test("inventory sees the owner's number", async () => {
  assert.deepEqual((await call(`/clients/${ownerFile}`, { cookie: manar })).body.phones, [phone(1)]);
});

test("finance reads every file and its balance, read-only: no contact log, no merge; no owner numbers", async () => {
  const file = await call(`/clients/${ownerFile}`, { cookie: finance });
  assert.equal(file.status, 200);
  assert.deepEqual(file.body.balance, { paid: "0.00", remaining: "0.00" });
  assert.equal(file.body.phones, null);
  assert.equal((await call(`/clients?q=${encodeURIComponent(P)}`, { cookie: finance })).body.total, 2);
  assert.equal((await call(`/clients/${clientFile}/interactions`, { method: "POST", cookie: finance, body: { kind: "مكالمة", text: "x" } })).status, 403);
  assert.equal((await call(`/clients/${clientFile}/merges`, { method: "POST", cookie: finance, body: { phone: phone(1) } })).status, 403);
  assert.equal((await call("/clients/merges", { cookie: finance })).status, 403);
});
