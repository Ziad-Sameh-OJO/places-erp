/**
 * The lead drawer's «تعديل البيانات» and «أرشفة» (demo leads.js leadEdit / leadArchive) against the real API and
 * database. Ahmed Younes (sales) edits his own lead; Ahmed Amr (another salesperson) can't reach it; Basant (HR) has
 * no leads at all. A mobile another lead has is refused (M-01 Q7). Archiving is «leads: delete» (the admin, Ahmed
 * Islam): sales can't; the archived lead leaves the list and the drawer, audited.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const C = `E2E ${stamp} LE`;
let younes: string, amr: string, hr: string, admin: string;
let leadId: string, otherId: string;
const phone = (n: number) => `010${stamp.slice(-7)}${n}`;

before(async () => {
  [younes, amr, hr, admin] = await Promise.all(["ahmed.younes@places.com", "ahmed.amr@places.com", "basant.elsawy@places.com", "ahmed.islam@places.com"].map((e) => session(e)));
  const owner = await prisma.employee.findFirstOrThrow({ where: { user: { email: "ahmed.younes@places.com" } } });
  const lead = (n: number, name: string) => prisma.lead.create({ data: {
    code: `L-LE${stamp}${n}`, name, phones: [phone(n)], area: "التجمع الخامس", type: "Rent", space: 200, budget: "50000", channel: "Facebook",
    assignedToId: owner.id, assignedAt: new Date(), createdById: "e2e", stage: "INTERESTED", qualified: true,
  } });
  leadId = (await lead(1, `${C} عميل`)).id;
  otherId = (await lead(2, `${C} عميل تاني`)).id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [leadId, otherId] } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-LE${stamp}` } } });
  await prisma.$disconnect();
});

const body = (over: object = {}) => ({ kind: "client", name: `${C} عميل`, phones: [phone(1)], area: "التجمع الخامس", type: "Rent", space: 200, budget: "50000", ...over });
const edit = (cookie: string, over: object = {}, id = leadId) => call(`/leads/${id}`, { method: "PUT", cookie, body: body(over) });

test("who may edit: the salesperson on his lead; another salesperson gets 404, HR 403", async () => {
  assert.equal((await edit(hr)).status, 403);
  assert.equal((await edit(amr, { name: `${C} مش بتاعه` })).status, 404);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).name, `${C} عميل`);
});

test("«تعديل البيانات»: saved, audited old → new, a line in the Activity; nothing changed = nothing recorded", async () => {
  const r = await edit(younes, { name: `${C} عميل جديد`, phones: [phone(1), phone(3)], space: 250, budget: "60000.5", condition: "Finished", note: "عايز دور أرضي", kind: "broker" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.name, `${C} عميل جديد`);
  assert.deepEqual(r.body.phones, [phone(1), phone(3)]);
  assert.equal(r.body.budget, "60000.50");
  assert.equal(r.body.kind, "broker");
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Lead", entityId: leadId, action: "update" } });
  assert.deepEqual(audit.before, { name: `${C} عميل`, kind: "client", phones: [phone(1)], space: 200, condition: null, budget: "50000.00", note: null });
  assert.deepEqual(audit.after, { name: `${C} عميل جديد`, kind: "broker", phones: [phone(1), phone(3)], space: 250, condition: "Finished", budget: "60000.50", note: "عايز دور أرضي" });
  assert.equal(await prisma.leadActivity.count({ where: { leadId, kind: "edit" } }), 1);
  // the same form again: no audit, no Activity
  assert.equal((await edit(younes, { name: `${C} عميل جديد`, phones: [phone(1), phone(3)], space: 250, budget: "60000.50", condition: "Finished", note: "عايز دور أرضي", kind: "broker" })).status, 200);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Lead", entityId: leadId, action: "update" } }), 1);
});

test("M-01 Q7: a mobile another lead has is refused with that lead's code; the lead stays as it was", async () => {
  const r = await edit(younes, { name: `${C} عميل جديد`, phones: [phone(1), phone(2)] });
  assert.equal(r.status, 409);
  assert.match(r.body.error, new RegExp(`L-LE${stamp}2`));
  assert.deepEqual((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).phones, [phone(1), phone(3)]);
});

test("«أرشفة»: sales can't; the admin archives, audited, and the lead leaves the drawer and the list", async () => {
  assert.equal((await call(`/leads/${otherId}/archive`, { method: "POST", cookie: younes })).status, 403);
  const r = await call(`/leads/${otherId}/archive`, { method: "POST", cookie: admin });
  assert.equal(r.status, 200);
  assert.ok((await prisma.lead.findUniqueOrThrow({ where: { id: otherId } })).archivedAt);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Lead", entityId: otherId, action: "archive" } }), 1);
  assert.equal((await call(`/leads/${otherId}`, { cookie: younes })).status, 404);
  const list = await call(`/leads?q=${encodeURIComponent(C)}`, { cookie: younes });
  assert.deepEqual(list.body.items.map((l: { id: string }) => l.id), [leadId]);
  assert.equal((await call(`/leads/${otherId}/archive`, { method: "POST", cookie: admin })).status, 404); // once
  // its number is free again: an archived lead isn't a duplicate (findByPhone skips archived leads)
  assert.equal((await edit(younes, { name: `${C} عميل جديد`, phones: [phone(1), phone(2)] })).status, 200);
});
