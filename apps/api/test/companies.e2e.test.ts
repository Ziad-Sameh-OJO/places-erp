/**
 * 1.20 «شيت الشركات» (M-01 2.1, 6.1): Telesales (Hadeer) keeps the sheet by category and adds Outbound companies; a
 * company someone else writes on a lead that isn't in the sheet reaches Telesales, who adds it with its category.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const START = new Date();
const stamp = String(Date.now());
const NAME = `E2E-C ${stamp}`;
let hadeer: string, heba: string, mohsen: string, hr: string, hadeerUser: string, category: string;
const leadIds: string[] = [];

before(async () => {
  [hadeer, heba, mohsen, hr] = await Promise.all(["hadeer.tarek@places.com", "heba.salah@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  hadeerUser = (await prisma.user.findUniqueOrThrow({ where: { email: "hadeer.tarek@places.com" } })).id;
  const cats = (await call("/companies?pageSize=1", { cookie: hadeer })).body.categories as { name: string }[];
  category = cats.at(-1)!.name; // the report test (1.21) adds to the first ones at the same time
});
after(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } }); // their company requests go with them
  const companies = await prisma.company.findMany({ where: { name: { startsWith: NAME } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: companies.map((c) => c.id) } } });
  await prisma.company.deleteMany({ where: { id: { in: companies.map((c) => c.id) } } });
  await prisma.notification.deleteMany({ where: { createdAt: { gte: START }, text: { contains: NAME } } });
  await prisma.$disconnect();
});

const newLead = async (cookie: string, n: number, extra: object) => {
  const r = await call("/leads", { method: "POST", cookie, body: { name: `${NAME} عميل ${n}`, phones: [`0108${stamp.slice(-6)}${n}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook", ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  leadIds.push(r.body.id);
  return r.body as { id: string; code: string };
};

test("who: the sheet for Telesales and Operations; adding is Telesales' only (403 for Operations); sales and HR 403", async () => {
  assert.equal((await call("/companies", { cookie: hadeer })).status, 200);
  assert.equal((await call("/companies", { cookie: heba })).status, 200);
  assert.equal((await call("/companies", { cookie: mohsen })).status, 403);
  assert.equal((await call("/companies", { cookie: hr })).status, 403);
  assert.equal((await call("/companies", { method: "POST", cookie: heba, body: { name: `${NAME} x`, category, number: "0100" } })).status, 403);
});

test("Outbound: added under its category, counted this week, audited; same name (any case) or number is 409; a lead's number is said", async () => {
  const before = (await call("/companies?pageSize=1", { cookie: hadeer })).body;
  const lead = await newLead(heba, 1, {});
  const phone = `0108${stamp.slice(-6)}1`;
  const r = await call("/companies", { method: "POST", cookie: hadeer, body: { name: `${NAME} أولى`, category, number: phone } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual([r.body.category, r.body.leadCode], [category, lead.code]);
  const after = (await call(`/companies?pageSize=5&category=${encodeURIComponent(category)}`, { cookie: hadeer })).body;
  assert.equal(after.outboundThisWeek, before.outboundThisWeek + 1);
  assert.equal(after.categories.find((c: { name: string }) => c.name === category).count, before.categories.find((c: { name: string }) => c.name === category).count + 1);
  assert.ok(after.items.some((c: { name: string; outbound: boolean }) => c.name === `${NAME} أولى` && c.outbound));
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Company", entityId: r.body.id, action: "create" } }));
  assert.equal((await call("/companies", { method: "POST", cookie: hadeer, body: { name: `  ${NAME} أولى `.toUpperCase(), category, number: "01111111111" } })).status, 409);
  assert.equal((await call("/companies", { method: "POST", cookie: hadeer, body: { name: `${NAME} تانية`, category, number: phone } })).status, 409);
  assert.equal((await call("/companies", { method: "POST", cookie: hadeer, body: { name: `${NAME} تالتة`, category: "مش موجودة", number: "0122" } })).status, 400);
  assert.equal((await call("/companies", { method: "POST", cookie: hadeer, body: { name: `${NAME} رابعة`, category } })).status, 400); // the number is required
});

test("a new company on someone else's lead → Telesales is notified and adds it with its category; the lead points to it", async () => {
  const lead = await newLead(mohsen, 2, { company: `${NAME} جديدة` });
  assert.ok(await prisma.notification.findFirst({ where: { userId: hadeerUser, text: `شركة جديدة «${NAME} جديدة» اتضافت في ليد ${lead.code} · محتاجة تتضاف لشيت الشركات` } }));
  assert.deepEqual(await call("/companies/pending", { cookie: heba }).then((r) => r.status), 403);
  const pending = (await call("/companies/pending", { cookie: hadeer })).body as { id: string; name: string; lead: { code: string }; by: string }[];
  const p = pending.find((x) => x.name === `${NAME} جديدة`)!;
  assert.deepEqual([p.lead.code, p.by], [lead.code, "Mohamed Mohsen"]);
  const r = await call(`/companies/pending/${p.id}`, { method: "POST", cookie: hadeer, body: { category } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { company: true } })).company?.name, `${NAME} جديدة`);
  assert.equal((await call(`/companies/pending/${p.id}`, { method: "POST", cookie: hadeer, body: { category } })).status, 409);
  assert.ok(!(await call("/companies/pending", { cookie: hadeer })).body.some((x: { id: string }) => x.id === p.id));
});

test("Telesales' own lead with a new company: «أضيفها لشيت الشركات» adds it at once, nobody is notified", async () => {
  const lead = await newLead(hadeer, 3, { company: `${NAME} من هدير`, companyCategory: category, keep: true });
  const row = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { company: true } });
  assert.deepEqual([row.company?.name, row.company?.category], [`${NAME} من هدير`, category]);
  assert.equal(await prisma.notification.count({ where: { text: { contains: `${NAME} من هدير` } } }), 0);
  // a company already in the sheet, in another case: the lead points to it, no request
  const again = await newLead(mohsen, 4, { company: `${NAME} من هدير`.toUpperCase() });
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: again.id } })).companyId, row.companyId);
  assert.equal(await prisma.companyRequest.count({ where: { leadId: again.id } }), 0);
});

test("«عدّل»: Telesales edits every column; a name or number another company has is 409; others 403; audited", async () => {
  const add = (n: string, num: string) => call("/companies", { method: "POST", cookie: hadeer, body: { name: `${NAME} ${n}`, category, number: num } });
  const a = (await add("edit-a", `0155${stamp.slice(-7)}`)).body.id as string;
  await add("edit-b", `0166${stamp.slice(-7)}`);
  const body = {
    name: `${NAME} edit-a2`, category, number: `0155${stamp.slice(-7)}`, contactName: "أحمد", contactTitle: "HR", email: "a@x.com",
    currentLocation: "التجمع", currentSpace: 300, contractStart: "2026-01-01", contractEnd: "2027-01-01", averageRent: "650.50", annualEscalation: 10, feedback: "مهتمين",
  };
  const r = await call(`/companies/${a}`, { method: "PATCH", cookie: hadeer, body });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.name, r.body.currentSpace, r.body.contractEnd, r.body.averageRent, r.body.feedback], [`${NAME} edit-a2`, 300, "2027-01-01", "650.50", "مهتمين"]);
  // clearing a column: null
  assert.equal((await call(`/companies/${a}`, { method: "PATCH", cookie: hadeer, body: { ...body, feedback: null, email: null } })).body.feedback, null);
  assert.equal((await call(`/companies/${a}`, { method: "PATCH", cookie: hadeer, body: { ...body, name: `${NAME} edit-b` } })).status, 409);
  assert.equal((await call(`/companies/${a}`, { method: "PATCH", cookie: hadeer, body: { ...body, contractEnd: "2025-01-01" } })).status, 400); // ends before it starts
  assert.equal((await call(`/companies/${a}`, { method: "PATCH", cookie: heba, body })).status, 403); // Operations reads, Telesales keeps
  assert.equal((await call(`/companies/${a}`, { method: "PATCH", cookie: mohsen, body })).status, 403);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Company", entityId: a, action: "update" } }), 2);
});

test("«عدّل» a company whose category was switched off: its feedback is saved; moving it to an inactive category is 400", async () => {
  const off = `E2E قديمة ${stamp}`; // a category no longer in the active list
  const c = await prisma.company.create({ data: { name: `${NAME} off-cat`, category: off, number: `0177${stamp.slice(-7)}`, createdById: hadeerUser } });
  const body = { name: c.name, category: off, number: c.number, feedback: "لسه بيدوروا" };
  assert.equal((await call(`/companies/${c.id}`, { method: "PATCH", cookie: heba, body })).status, 403);
  const r = await call(`/companies/${c.id}`, { method: "PATCH", cookie: hadeer, body });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.category, r.body.feedback], [off, "لسه بيدوروا"]);
  const moved = await call(`/companies/${c.id}`, { method: "PATCH", cookie: hadeer, body: { ...body, category: "مش موجودة" } });
  assert.equal(moved.status, 400);
  assert.equal(moved.body.error, "الكاتيجوري دي مش في القايمة");
  assert.equal((await call(`/companies/${c.id}`, { method: "PATCH", cookie: hadeer, body: { ...body, category } })).body.category, category);
});

test("«أضف للشيت»: every lead that wrote the same new company points to it, not only the first", async () => {
  const one = await newLead(mohsen, 5, { company: `${NAME} مكررة` });
  const two = await newLead(mohsen, 6, { company: `${NAME} مكررة` });
  const p = ((await call("/companies/pending", { cookie: hadeer })).body as { id: string; lead: { id: string } }[]).find((x) => x.lead.id === one.id)!;
  assert.equal((await call(`/companies/pending/${p.id}`, { method: "POST", cookie: hadeer, body: { category } })).status, 201);
  const leads = await prisma.lead.findMany({ where: { id: { in: [one.id, two.id] } }, include: { company: true } });
  assert.deepEqual(leads.map((l) => l.company?.name), [`${NAME} مكررة`, `${NAME} مكررة`]);
  assert.equal(await prisma.companyRequest.count({ where: { leadId: { in: [one.id, two.id] }, status: "pending" } }), 0);
});

test("a lead whose company changed before Telesales added the old one keeps its new company; the old request is gone", async () => {
  const lead = await newLead(mohsen, 7, { company: `${NAME} قديمة` });
  const r = await call(`/leads/${lead.id}`, { method: "PUT", cookie: mohsen, body: {
    name: `${NAME} عميل 7`, kind: "client", company: `${NAME} أولى`, phones: [`0108${stamp.slice(-6)}7`], area: "التجمع الخامس", type: "Rent",
  } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const inSheet = (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { company: true } })).company?.name;
  assert.equal(inSheet, `${NAME} أولى`); // added by the Outbound test above
  assert.equal(await prisma.companyRequest.count({ where: { leadId: lead.id, status: "pending" } }), 0);
  assert.ok(!((await call("/companies/pending", { cookie: hadeer })).body as { lead: { id: string } }[]).some((x) => x.lead.id === lead.id));
});

test("«عدّل» the sheet's «date» (the last contact): Telesales writes it; empty falls back to when it was added", async () => {
  const c = await prisma.company.create({ data: { name: `${NAME} date`, category, number: `0188${stamp.slice(-7)}`, createdById: hadeerUser } });
  const body = { name: c.name, category, number: c.number, contactedOn: "2026-10-01" };
  assert.equal((await call(`/companies/${c.id}`, { method: "PATCH", cookie: hadeer, body })).body.date, "2026-10-01");
  assert.equal((await call(`/companies/${c.id}`, { method: "PATCH", cookie: hadeer, body: { ...body, contactedOn: null } })).body.date, c.createdAt.toISOString().slice(0, 10));
});
