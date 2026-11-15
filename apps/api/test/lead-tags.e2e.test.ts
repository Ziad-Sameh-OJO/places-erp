/**
 * M-01 · Tags on a lead (client, 11 Nov): Mohsen tags Ahmed Ali on his lead → Pending with their Team Leader (Abdallah);
 * approved, Ahmed Ali sees and works it; a Team Leader's tag on his own team is approved at once, another team's waits
 * for that team's Team Leader; who may decide.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const emails = { mohsen: "m.mohsen@places.com", ali: "ahmed.ali@places.com", eid: "m.eid@places.com", anas: "anas@places.com", abdallah: "abdallah.sleem@places.com", mostafa: "mostafa.ezzat@places.com" };
type K = keyof typeof emails;
const ck = {} as Record<K, string>, emp = {} as Record<K, string>;
let leadId: string;
const START = new Date();

before(async () => {
  for (const k of Object.keys(emails) as K[]) {
    ck[k] = await session(emails[k]);
    emp[k] = (await prisma.employee.findFirstOrThrow({ where: { user: { email: emails[k] } } })).id;
  }
  leadId = (await prisma.lead.create({ data: {
    code: `L-TG${stamp}`, name: `E2E-TG ${stamp}`, phones: [`0107${stamp.slice(-7)}`.slice(0, 11)], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    createdById: "e2e", assignedToId: emp.mohsen, assignedAt: new Date(),
  } })).id;
});

after(async () => {
  await prisma.lead.deleteMany({ where: { id: leadId } }); // its tags go with it
  await prisma.notification.deleteMany({ where: { event: { in: ["lead.tag_request", "lead.tag_decided"] }, createdAt: { gte: START } } });
  await prisma.$disconnect();
});

const ask = (who: K, ids: string[]) => call("/lead-tags", { method: "POST", cookie: ck[who], body: { leadId, employeeIds: ids } });
const tagsOf = async (who: K) => (await call(`/lead-tags?leadId=${leadId}`, { cookie: ck[who] })).body.items as Array<{ id: string; tagged: string; status: string; canDecide: boolean }>;

test("what can't be tagged: yourself, the owner; a lead you don't reach is 404", async () => {
  assert.equal((await ask("mohsen", [emp.mohsen])).status, 400);
  assert.equal((await ask("ali", [emp.eid])).status, 404); // Ahmed Ali doesn't reach Mohsen's lead (yet)
});

test("Mohsen tags Ahmed Ali → Pending with Abdallah; another TL can't decide; approved, Ahmed Ali sees and works the lead", async () => {
  const r = await ask("mohsen", [emp.ali]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const tag = (await tagsOf("mohsen")).find((x) => x.status === "PENDING")!;
  assert.ok(tag);
  assert.equal((await ask("mohsen", [emp.ali])).status, 409); // already asked
  assert.equal((await call(`/leads/${leadId}`, { cookie: ck.ali })).status, 404); // not before the approval
  const abdallahUser = (await prisma.user.findUniqueOrThrow({ where: { email: emails.abdallah } })).id;
  assert.ok(await prisma.notification.findFirst({ where: { event: "lead.tag_request", userId: abdallahUser, createdAt: { gte: START } } }));
  const tabs = (await call("/lead-tags", { cookie: ck.abdallah })).body;
  assert.ok(tabs.items.some((x: { id: string; canDecide: boolean }) => x.id === tag.id && x.canDecide));
  assert.equal((await call(`/lead-tags/${tag.id}/decide`, { method: "POST", cookie: ck.mostafa, body: { approve: true } })).status, 403);
  assert.equal((await call(`/lead-tags/${tag.id}/decide`, { method: "POST", cookie: ck.abdallah, body: { approve: true } })).status, 200);
  assert.equal((await call(`/lead-tags/${tag.id}/decide`, { method: "POST", cookie: ck.abdallah, body: { approve: false } })).status, 409); // decided already
  assert.equal((await call(`/leads/${leadId}`, { cookie: ck.ali })).status, 200);
  assert.ok((await call("/leads?pageSize=100", { cookie: ck.ali })).body.items.some((l: { id: string }) => l.id === leadId));
  assert.equal((await call(`/leads/${leadId}/comments`, { method: "POST", cookie: ck.ali, body: { text: "شغال معاك" } })).status, 201);
  assert.equal((await call(`/leads/${leadId}`, { cookie: ck.mohsen })).body.assignedTo.id, emp.mohsen); // still Mohsen's
  assert.equal(await prisma.auditLog.count({ where: { entity: "LeadTag", entityId: tag.id } }), 2);
});

test("a Team Leader's tag: his own team approved at once, another team's waits for its Team Leader", async () => {
  const r = await ask("abdallah", [emp.eid, emp.anas]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const rows = await tagsOf("abdallah");
  const eid = rows.find((x) => x.tagged === "محمد عيد")!, anas = rows.find((x) => x.tagged === "أنس")!;
  assert.equal(eid.status, "APPROVED");
  assert.equal(anas.status, "PENDING");
  assert.equal(anas.canDecide, false); // Abdallah isn't Anas's Team Leader
  assert.equal((await call(`/lead-tags/${anas.id}/decide`, { method: "POST", cookie: ck.mostafa, body: { approve: false } })).status, 200);
  assert.equal((await call(`/leads/${leadId}`, { cookie: ck.anas })).status, 404); // rejected: nothing changes for him
  assert.equal((await call(`/leads/${leadId}`, { cookie: ck.eid })).status, 200);
});
