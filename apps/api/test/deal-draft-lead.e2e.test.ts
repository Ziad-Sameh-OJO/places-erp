/**
 * M-01 «السيلز يقدر يفتح صفقة على ليده اللي في الـ Draft» (4 Nov meeting) · M-02: Omar Gamal's lead was pulled to the
 * Draft; «سجّل صفقة» still offers it to him (in its own group) and the deal brings the lead back to him, out of the
 * Draft, in the same transaction. Mohamed Mohsen, another salesperson, neither sees it nor can close on it.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { cleanFinance } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E ${stamp} DDL`;
let omar: string, mohsen: string;
let omarId: string, leadId: string, unitId: string, stayId: string;

before(async () => {
  [omar, mohsen] = await Promise.all(["omar.gamal@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  omarId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "omar.gamal@places.com" } } })).id;
  const agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "ahmed.ali@places.com" } } })).id;
  // pulled to the Draft the way the job does it (worker/processors/draft.ts): no salesperson, an open stay from Omar
  leadId = (await prisma.lead.create({ data: {
    code: `L-DDL${stamp}`, name: `${C} عميل`, phones: [`0105${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    assignedToId: null, draft: "draft", createdById: "e2e", stage: "INTERESTED", qualified: true, createdAt: new Date(Date.now() - 10 * 86_400_000),
  } })).id;
  stayId = (await prisma.leadDraft.create({ data: { leadId, kind: "draft", fromId: omarId, stage: "INTERESTED", days: 7 } })).id;
  unitId = (await prisma.unit.create({ data: {
    code: `U-DDL${stamp}`, type: "Rent", project: `${C} مشروع`, area: "التجمع الخامس", space: 300, condition: "Finished", pdfStatus: "confirmed", agentId,
  } })).id;
});

after(async () => {
  const deals = (await prisma.deal.findMany({ where: { company: { startsWith: C } }, select: { id: true } })).map((d) => d.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...deals, leadId, stayId] } }] } });
  await prisma.deal.deleteMany({ where: { id: { in: deals } } });
  await cleanFinance(C, new Date(0));
  await prisma.notification.deleteMany({ where: { text: { contains: C } } });
  const files = (await prisma.lead.findMany({ where: { id: leadId, clientId: { not: null } }, select: { clientId: true } })).map((l) => l.clientId!);
  await prisma.lead.deleteMany({ where: { id: leadId } });
  const empty = (await prisma.client.findMany({ where: { id: { in: files }, leads: { none: {} }, units: { none: {} } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: empty } } });
  await prisma.client.deleteMany({ where: { id: { in: empty } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.$disconnect();
});

const body = () => ({ leadId, unitId, space: 300, type: "Rent", commissionOwner: "10000", commissionClient: "0", withMe: [] });
type FormLead = { id: string; draft: { from: string | null } | null };

test("«سجّل صفقة» offers the Draft lead to the salesperson it was pulled from, in its own group; not to another one", async () => {
  const own = await call("/deals/form", { cookie: omar });
  assert.equal(own.status, 200);
  const l = (own.body.leads as FormLead[]).find((x) => x.id === leadId);
  assert.deepEqual(l?.draft, { from: null }); // his own: no «كان عند …»
  assert.equal(((await call("/deals/form", { cookie: mohsen })).body.leads as FormLead[]).some((x) => x.id === leadId), false);
});

test("another salesperson can't close on it", async () => {
  const r = await call("/deals", { method: "POST", cookie: mohsen, body: body() });
  assert.equal(r.status, 404);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).draft, "draft");
});

test("the deal brings the lead back to him, out of the Draft, audited, with Operations told", async () => {
  const r = await call("/deals", { method: "POST", cookie: omar, body: body() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(lead.draft, null);
  assert.equal(lead.assignedToId, omarId);
  assert.equal(lead.stage, "DONE_DEAL");
  const stay = await prisma.leadDraft.findUniqueOrThrow({ where: { id: stayId } });
  assert.equal(stay.decision, "deal");
  assert.equal(stay.toId, omarId);
  assert.ok(stay.decidedAt);
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: r.body.id }, select: { code: true, participants: { select: { employeeId: true, side: true } } } });
  assert.ok(deal.participants.some((p) => p.employeeId === omarId && p.side === "BUYER")); // he closed it, not whoever clicked
  assert.equal(await prisma.auditLog.count({ where: { entity: "Lead", entityId: leadId, action: "draft-route" } }), 1);
  assert.match((await prisma.leadActivity.findFirstOrThrow({ where: { leadId, kind: "assign" } })).text, new RegExp(`^رجع من الـ Draft لـ .+ بصفقة ${deal.code}$`));
  const heba = await prisma.user.findFirstOrThrow({ where: { email: "heba.salah@places.com" } });
  assert.equal(await prisma.notification.count({ where: { userId: heba.id, text: { contains: `فتح صفقة ${deal.code} على ${C} عميل من الـ Draft` } } }), 1);
  // out of the Draft tab now: a second deal on it is an ordinary one of his leads
  assert.equal(((await call("/deals/form", { cookie: omar })).body.leads as FormLead[]).find((x) => x.id === leadId)?.draft, null);
});
