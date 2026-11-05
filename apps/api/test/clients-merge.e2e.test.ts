/**
 * 3.4 · merging two files of the same person (M-10 2.2): suggested by number, approved by Operations, everything moves
 * into the kept file, audited before and after. Manar keeps the inventory (edits files), Heba is Operations (approves),
 * Mohamed Mohsen is a salesperson (neither).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const P = `E2E merge ${stamp}`; // own prefix: the clients files start in the same millisecond
const phone = (n: number) => `0158${stamp.slice(-6)}${n}`; // own prefix: other e2e files use 010 / 011 / 012 + the same stamp
let manar: string, heba: string, mohsen: string;
const files: Record<string, string> = {};
const leadIds: string[] = [];
let unitId: string;

const file = (key: string, kind: "client" | "owner", n: number) =>
  prisma.client.create({ data: { name: `${P} ${key}`, kind, phones: { create: [{ phone: phone(n) }] } } }).then((c) => { files[key] = c.id; return c.id; });

before(async () => {
  [manar, heba, mohsen] = await Promise.all(["manar.ahmed@places.com", "heba.salah@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  await file("A", "owner", 1);
  await file("B", "client", 2);
  await file("C", "owner", 3);
  await file("D", "owner", 4);
  await file("E", "owner", 5);
  await file("F", "owner", 6);
  unitId = (await prisma.unit.create({ data: { code: `U-M${stamp}`, type: "Rent", project: `${P} مشروع`, area: "التجمع الخامس", space: 90, condition: "Finished", ownerId: files.A! } })).id;
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  const lead = await prisma.lead.create({ data: { code: `L-M${stamp}`, name: `${P} B`, phones: [phone(2)], area: "التجمع الخامس", type: "Rent", channel: "Facebook", assignedToId: emp.id, createdById: "e2e", clientId: files.B! } });
  leadIds.push(lead.id);
  await prisma.clientInteraction.create({ data: { clientId: files.B!, kind: "مكالمة", text: `${P} مكالمة`, byId: emp.userId } });
});

after(async () => {
  const ids = Object.values(files);
  const merges = await prisma.clientMerge.findMany({ where: { OR: [{ keepId: { in: ids } }, { dropId: { in: ids } }] }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...leadIds, ...merges.map((m) => m.id)] } } });
  await prisma.clientMerge.deleteMany({ where: { id: { in: merges.map((m) => m.id) } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.client.deleteMany({ where: { OR: [{ id: { in: ids } }, { name: { startsWith: P } }] } });
  await prisma.$disconnect();
});

const suggest = (cookie: string, keep: string, p: string) => call(`/clients/${keep}/merges`, { method: "POST", cookie, body: { phone: p } });
const decide = (cookie: string, id: string, decision: string) => call(`/clients/merges/${id}`, { method: "POST", cookie, body: { decision } });

test("who: sales can't suggest; only Operations sees and decides merges", async () => {
  assert.equal((await suggest(mohsen, files.A!, phone(2))).status, 403);
  assert.equal((await call("/clients/merges", { cookie: manar })).status, 403);
  assert.equal((await call("/clients/merges", { cookie: heba })).status, 200);
});

test("suggest by the other file's number, written any way; a number of the same file, an unknown one and a second request are refused", async () => {
  const r = await suggest(manar, files.A!, `+2 ${phone(2)}`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await suggest(manar, files.A!, phone(2))).status, 400); // already waiting
  assert.equal((await suggest(manar, files.B!, phone(1))).status, 400); // the same pair the other way round
  assert.equal((await suggest(manar, files.A!, phone(1))).status, 400); // its own number
  assert.equal((await suggest(manar, files.A!, "01234567890")).status, 400); // nobody's
  const queue = (await call("/clients/merges", { cookie: heba })).body;
  const row = queue.find((m: { id: string }) => m.id === r.body.id);
  assert.equal(row.keep.id, files.A);
  assert.equal(row.drop.id, files.B);
  assert.equal(row.by, "منار أحمد");
  assert.equal((await decide(manar, r.body.id, "approve")).status, 403);
});

test("Operations approves: numbers, leads, units and the contact log move to the kept file; the other is archived; audited before / after", async () => {
  const m = await prisma.clientMerge.findFirstOrThrow({ where: { keepId: files.A!, dropId: files.B!, status: "pending" } });
  assert.equal((await decide(heba, m.id, "approve")).status, 204);
  const kept = (await call(`/clients/${files.A}`, { cookie: heba })).body;
  assert.equal(kept.kind, "both");
  assert.deepEqual([...kept.phones].sort(), [phone(1), phone(2)]);
  assert.deepEqual(kept.leads.map((l: { id: string }) => l.id), leadIds);
  assert.equal(kept.units[0].id, unitId);
  assert.ok(kept.timeline.some((x: { text: string }) => x.text === `مكالمة: ${P} مكالمة`));
  const gone = await prisma.client.findUniqueOrThrow({ where: { id: files.B! } });
  assert.ok(gone.archivedAt);
  assert.equal(gone.mergedIntoId, files.A);
  assert.equal((await call(`/clients/${files.B}`, { cookie: heba })).status, 404);
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Client", entityId: files.A!, action: "merge" } });
  assert.equal((log.before as { drop: { id: string } }).drop.id, files.B);
  assert.equal((log.after as { kind: string }).kind, "both");
  assert.equal((await decide(heba, m.id, "approve")).status, 404); // decided once
});

test("Operations rejects: both files stay as they were", async () => {
  const r = await suggest(manar, files.C!, phone(4));
  assert.equal((await decide(heba, r.body.id, "reject")).status, 204);
  assert.equal((await prisma.clientMerge.findUniqueOrThrow({ where: { id: r.body.id } })).status, "rejected");
  assert.equal((await prisma.client.findUniqueOrThrow({ where: { id: files.D! } })).archivedAt, null);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "ClientMerge", entityId: r.body.id, action: "reject" } }));
});

test("the system suggests a merge when a Done Deal's numbers are on two files", async () => {
  const r = await call("/leads", { method: "POST", cookie: mohsen, body: { name: `${P} عميل برقمين`, phones: [phone(5), phone(6)], area: "التجمع الخامس", type: "Rent", channel: "Facebook" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  leadIds.push(r.body.id);
  assert.equal((await call(`/leads/${r.body.id}/stage`, { method: "PATCH", cookie: mohsen, body: { stage: "Done Deal" } })).status, 200);
  const m = await prisma.clientMerge.findFirst({ where: { keepId: files.E!, dropId: files.F!, status: "pending" } });
  assert.ok(m);
  assert.equal(m.suggestedById, null);
});
