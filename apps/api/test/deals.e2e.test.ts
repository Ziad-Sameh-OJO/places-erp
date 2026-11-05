/**
 * 5.2 Done Deal → Office Manager review → Approved (M-02 2.1 · Q9) against the real API and database.
 * Mohamed Mohsen (sales, team D) closes the deal with Mohamed Eid on the Buyer side; the unit's agent Ahmed Ali is
 * the Seller (waiting for Manar). Nancy is the Office Manager; Ahmed Ashraf the accountant (sees deals, can't review);
 * Omar Gamal is a salesperson on another team; Basant is HR (no deals at all).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { cleanFinance } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E ${stamp}`;
let rahma: string, mohsen: string, nancy: string, ashraf: string, omar: string, sleem: string, hr: string;
const emp: Record<string, { id: string; userId: string }> = {};
let leadId: string, freshLeadId: string, unit4Id: string, unitId: string, unit2Id: string, draftUnitId: string, companyId: string;

before(async () => {
  [rahma, mohsen, nancy, ashraf, omar, sleem, hr] = await Promise.all([
    "rahma.hassan@places.com", "m.mohsen@places.com", "nancy.islam@places.com", "ahmed.ashraf@places.com", "omar.gamal@places.com", "abdallah.sleem@places.com", "basant.elsawy@places.com",
  ].map((e) => session(e)));
  for (const [k, email] of [["mohsen", "m.mohsen"], ["eid", "m.eid"], ["ali", "ahmed.ali"], ["nancy", "nancy.islam"], ["ashraf", "ahmed.ashraf"], ["basant", "basant.elsawy"], ["rahma", "rahma.hassan"]] as const) {
    const e = await prisma.employee.findFirstOrThrow({ where: { user: { email: `${email}@places.com` } } });
    emp[k] = { id: e.id, userId: e.userId };
  }
  companyId = (await prisma.company.create({ data: { name: `${C} شركة`, category: "IT" } })).id;
  leadId = (await prisma.lead.create({ data: {
    code: `L-D${stamp}`, name: `${C} عميل`, companyId, phones: [`0102${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent",
    channel: "Facebook", assignedToId: emp.mohsen!.id, assignedAt: new Date(), createdById: "e2e", stage: "NEAR_TO_CLOSE", qualified: true,
    createdAt: new Date(Date.now() - 3 * 24 * 3_600_000), // worked on for days: an ordinary deal
  } })).id;
  freshLeadId = (await prisma.lead.create({ data: { // came in today and closes today: Q13
    code: `L-D${stamp}2`, name: `${C} عميل جديد`, phones: [`0103${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent",
    channel: "WhatsApp", assignedToId: emp.mohsen!.id, assignedAt: new Date(), createdById: "e2e", stage: "INTERESTED", qualified: true,
  } })).id;
  const unit = (n: number, pdfStatus: string) => prisma.unit.create({ data: {
    code: `U-D${stamp}${n}`, type: "Rent", project: `${C} مشروع ${n}`, area: "التجمع الخامس", space: 400 + n, condition: "Finished", pdfStatus, agentId: emp.ali!.id,
  } });
  unitId = (await unit(1, "confirmed")).id;
  unit2Id = (await unit(2, "confirmed")).id;
  draftUnitId = (await unit(3, "draft")).id;
  unit4Id = (await unit(4, "confirmed")).id;
});

after(async () => {
  await prisma.file.deleteMany({ where: { name: { startsWith: C } } });
  await prisma.deal.deleteMany({ where: { company: { startsWith: C } } });
  await cleanFinance(C, new Date(0)); // 9.12: the approval opened the client's account under 113 (named after the company)
  await prisma.notification.deleteMany({ where: { text: { contains: C } } });
  // a registered deal makes the lead's client file (M-10 2.1): gone with the leads, once nothing else is in it
  const files = (await prisma.lead.findMany({ where: { code: { startsWith: `L-D${stamp}` }, clientId: { not: null } }, select: { clientId: true } })).map((l) => l.clientId!);
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-D${stamp}` } } });
  const empty = (await prisma.client.findMany({ where: { id: { in: files }, leads: { none: {} }, units: { none: {} } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: empty } } });
  await prisma.client.deleteMany({ where: { id: { in: empty } } });
  await prisma.unit.deleteMany({ where: { code: { startsWith: `U-D${stamp}` } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

const register = (cookie: string, body: object) => call("/deals", { method: "POST", cookie, body });
const review = (cookie: string, id: string, body: object) => call(`/deals/${id}/review`, { method: "POST", cookie, body });
const dealBody = (over: object = {}) => ({ leadId, unitId, space: 401, type: "Rent", commissionOwner: "50000", commissionClient: "50000", withMe: [emp.eid!.id], ...over });
const unread = (userId: string) => prisma.notification.findMany({ where: { userId, text: { contains: C } }, orderBy: { createdAt: "desc" } });

test("«سجّل صفقة»: the salesperson's own leads with their company, open units with their agent; HR can't", async () => {
  const form = await call("/deals/form", { cookie: mohsen });
  assert.equal(form.status, 200);
  const lead = form.body.leads.find((l: { id: string }) => l.id === leadId);
  assert.equal(lead.company, `${C} شركة`);
  assert.ok(form.body.salespeople.some((p: { id: string }) => p.id === emp.eid!.id));
  assert.equal((await call("/deals/form", { cookie: omar })).body.leads.some((l: { id: string }) => l.id === leadId), false); // not his lead

  const units = await call(`/deals/units?q=${encodeURIComponent(`${C} مشروع`)}`, { cookie: mohsen });
  assert.equal(units.status, 200);
  assert.deepEqual(units.body.map((u: { id: string }) => u.id).sort(), [unitId, unit2Id, unit4Id].sort()); // the draft isn't offered
  assert.equal(units.body[0].agent.id, emp.ali!.id);

  assert.equal((await call("/deals/form", { cookie: hr })).status, 403);
  assert.equal((await call("/deals", { cookie: hr })).status, 403);
  assert.equal((await register(hr, dealBody())).status, 403);
});

test("the deal needs an expected commission, an open unit and real salespeople", async () => {
  assert.equal((await register(mohsen, dealBody({ commissionOwner: "0", commissionClient: "0" }))).status, 400);
  assert.equal((await register(mohsen, dealBody({ unitId: draftUnitId }))).status, 400);
  assert.equal((await register(mohsen, dealBody({ withMe: [emp.basant!.id] }))).status, 400); // HR isn't a salesperson
  assert.equal((await register(omar, dealBody())).status, 404); // someone else's lead
});

let dealId: string, code: string;

test("Done Deal: Pending Review, company and source from the lead, the agent as Seller waiting for Manar; the lead moves to Done Deal; the Office Manager is told", async () => {
  const r = await register(mohsen, dealBody());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ({ id: dealId, code } = r.body);
  assert.match(code, /^D-\d+$/);
  assert.equal(r.body.status, "Pending Review");
  assert.equal(r.body.offTarget, false);
  assert.equal(r.body.company, `${C} شركة`);
  assert.equal(r.body.source, "Facebook");
  assert.equal(r.body.location, `${C} مشروع 1`);
  assert.equal(r.body.commissionOwner, "50000.00");
  assert.deepEqual(r.body.buyers.map((b: { id: string }) => b.id).sort(), [emp.mohsen!.id, emp.eid!.id].sort());
  assert.deepEqual(r.body.sellers.map((s: { id: string; approved: boolean }) => [s.id, s.approved]), [[emp.ali!.id, false]]);

  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).stage, "DONE_DEAL");
  assert.ok((await unread(emp.nancy!.userId)).some((n) => n.text.includes(code) && n.text.includes("مستنية مراجعتك")));
  const audit = await prisma.auditLog.findFirst({ where: { module: "deals", entityId: dealId, action: "create" } });
  assert.equal((audit!.after as { commissionOwner: string }).commissionOwner, "50000.00");
});

test("scope (M-02 4.1): the salespeople on it and their TL see it; another team's salesperson doesn't", async () => {
  assert.equal((await call(`/deals/${dealId}`, { cookie: mohsen })).status, 200);
  assert.equal((await call(`/deals/${dealId}`, { cookie: sleem })).status, 200); // TL of team D
  assert.equal((await call(`/deals/${dealId}`, { cookie: omar })).status, 404);
  const list = await call(`/deals?q=${encodeURIComponent(C)}`, { cookie: omar });
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 0);
  const all = await call(`/deals?q=${encodeURIComponent(code)}&status=Pending%20Review`, { cookie: nancy });
  assert.deepEqual(all.body.items.map((d: { id: string }) => d.id), [dealId]);
});

test("Q9: only the Office Manager reviews; she corrects the amount (audited old → new) and approves; the accountant is told to collect", async () => {
  assert.equal((await review(mohsen, dealId, { decision: "approve" })).status, 403);
  assert.equal((await review(ashraf, dealId, { decision: "approve" })).status, 403); // sees deals, doesn't review them
  assert.equal((await review(nancy, dealId, { decision: "reject" })).status, 400); // no reason

  const r = await review(nancy, dealId, { decision: "approve", commissionOwner: "45000.50", space: 401, buyers: [emp.mohsen!.id] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "Approved");
  assert.equal(r.body.commissionOwner, "45000.50");
  assert.deepEqual(r.body.buyers.map((b: { id: string }) => b.id), [emp.mohsen!.id]);
  assert.equal(r.body.reviewedBy, "نانسي إسلام");

  const audit = await prisma.auditLog.findFirst({ where: { module: "deals", entityId: dealId, action: "approve" } });
  assert.deepEqual(audit!.before, { status: "PENDING_REVIEW", commissionOwner: "50000.00", buyers: [emp.mohsen!.id, emp.eid!.id].sort() });
  assert.deepEqual(audit!.after, { status: "APPROVED", commissionOwner: "45000.50", buyers: [emp.mohsen!.id] });
  assert.ok((await unread(emp.ashraf!.userId)).some((n) => n.text.includes(code) && n.text.includes("مستنية التحصيل")));
  assert.equal((await review(nancy, dealId, { decision: "approve" })).status, 400); // reviewed once
});

test("Q9: a rejection goes back to the salespeople with its reason", async () => {
  const r = await register(mohsen, dealBody({ unitId: unit2Id, withMe: [], commissionOwner: "0", commissionClient: "20000" }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const rej = await review(nancy, r.body.id, { decision: "reject", reason: `${C} المساحة غلط` });
  assert.equal(rej.status, 200);
  assert.equal(rej.body.status, "Rejected");
  assert.equal(rej.body.reviewNote, `${C} المساحة غلط`);
  assert.ok((await unread(emp.mohsen!.userId)).some((n) => n.text.includes(r.body.code) && n.text.includes("اترفضت")));
  assert.equal((await review(nancy, r.body.id, { decision: "approve" })).status, 400);
});

test("Q13 · 5.6: a lead created and closed within 24 hours → Alarm to the Office Manager, out of the target", async () => {
  const r = await register(mohsen, { leadId: freshLeadId, unitId: unit4Id, space: 404, type: "Rent", commissionOwner: "0", commissionClient: "30000", withMe: [] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.offTarget, true);
  const alarm = (await unread(emp.nancy!.userId)).find((n) => n.text.includes(r.body.code));
  assert.match(alarm!.text, /^Alarm: اتسجّلت وقت القفل/);
});

test("the note (Office Manager / Finance) on an approved deal: target only, audited; not before approval, not for sales", async () => {
  const body = { note: `${C} التارجت بمبلغ تاني`, targetBase: "60000" };
  assert.equal((await call(`/deals/${dealId}/note`, { method: "PUT", cookie: mohsen, body })).status, 403);
  const r = await call(`/deals/${dealId}/note`, { method: "PUT", cookie: ashraf, body }); // Finance
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.note, body.note);
  assert.equal(r.body.targetBase, "60000.00");
  assert.equal(r.body.commissionOwner, "45000.50"); // the commission doesn't move
  const audit = await prisma.auditLog.findFirst({ where: { module: "deals", entityId: dealId, action: "note" } });
  assert.deepEqual(audit!.after, { note: body.note, targetBase: "60000.00" });

  const cleared = await call(`/deals/${dealId}/note`, { method: "PUT", cookie: nancy, body: { note: "", targetBase: null } });
  assert.equal(cleared.body.targetBase, null);
  const pending = (await call(`/deals?q=${encodeURIComponent(C)}&status=Pending%20Review`, { cookie: nancy })).body.items[0];
  assert.equal((await call(`/deals/${pending.id}/note`, { method: "PUT", cookie: nancy, body })).status, 400);
});

test("4.9 · Q26: marketing is told of the approved deal and sees only location, space, company, type and the Buyer; attaches a logo", async () => {
  const told = (await unread(emp.rahma!.userId)).find((n) => n.text.startsWith("Done Deal اتسجّلت في الشيت"));
  assert.equal(told!.text, `Done Deal اتسجّلت في الشيت: Rent · ${C} مشروع 1 · 401 م · ${C} شركة · ${C} عميل`);

  const list = await call("/deals/marketing?pageSize=100", { cookie: rahma });
  assert.equal(list.status, 200);
  const row = list.body.items.find((d: { id: string }) => d.id === dealId);
  assert.deepEqual(Object.keys(row).sort(), ["buyer", "code", "company", "id", "location", "logo", "space", "type"]); // no money, no salespeople
  assert.deepEqual([row.buyer, row.company, row.type, row.space, row.logo], [`${C} عميل`, `${C} شركة`, "Rent", 401, null]);
  assert.equal(list.body.items.some((d: { company: string }) => d.company === `${C} عميل جديد`), false); // still waiting for review
  assert.equal((await call("/deals/marketing", { cookie: mohsen })).status, 403);
  assert.equal((await call(`/deals/${dealId}`, { cookie: rahma })).status, 403); // never the deal itself

  // an upload rahma finished (0.9); the bytes aren't needed to attach it
  const file = await prisma.file.create({ data: { key: `e2e/${stamp}.png`, name: `${C} logo.png`, mime: "image/png", size: 10, status: "READY", uploadedById: emp.rahma!.userId } });
  assert.equal((await call(`/deals/marketing/${dealId}/logo`, { method: "PUT", cookie: mohsen, body: { fileId: file.id } })).status, 403);
  const set = await call(`/deals/marketing/${dealId}/logo`, { method: "PUT", cookie: rahma, body: { fileId: file.id } });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.deepEqual(set.body, { id: file.id, name: `${C} logo.png` });
  const after = (await call("/deals/marketing?pageSize=100", { cookie: rahma })).body.items.find((d: { id: string }) => d.id === dealId);
  assert.equal(after.logo.id, file.id);
  const url = await call(`/deals/marketing/${dealId}/logo`, { cookie: rahma });
  assert.equal(url.status, 200);
  assert.match(url.body.url, /^https?:\/\//);
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "deals", entityId: dealId, action: "logo" } }));
});
