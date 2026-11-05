/**
 * 5.12 · 5.13 against the real API and database: every collection makes a new TCR (one company sequence, same deal
 * code, the collection's date) with a line for each salesperson on the deal; each signs their own line once; the TCR
 * prints as a PDF for whoever sees the deal.
 * Mohsen closes it with another salesperson on the Buyer side (the unit's agent waits for Manar, so isn't on it); Nancy approves;
 * Ahmed Ashraf collects; Basant (HR) can't see deals.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";
import { cleanFinance, fresh } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E-TCR ${stamp}`;
const since = new Date();
let mohsen: string, eid: string, nancy: string, ashraf: string, hr: string;
let dealId: string, bankId: string, revenueId: string, mohsenId: string, eidId: string;
let first: { id: string; code: string };

before(async () => {
  [mohsen, eid, nancy, ashraf, hr] = await Promise.all(["m.mohsen@places.com", "ahmed.younes@places.com", "nancy.islam@places.com", "ahmed.ashraf@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const emp = (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } } });
  [mohsenId, eidId] = (await Promise.all([emp("m.mohsen@places.com"), emp("ahmed.younes@places.com")])).map((e) => e.id) as [string, string];
  const ali = await emp("ahmed.ali@places.com");
  const leadId = (await prisma.lead.create({ data: {
    code: `L-T${stamp}`, name: `${C} عميل`, phones: [`0105${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    assignedToId: mohsenId, assignedAt: new Date(), createdById: "e2e", stage: "NEAR_TO_CLOSE", qualified: true, createdAt: new Date(Date.now() - 3 * 24 * 3_600_000),
  } })).id;
  const unitId = (await prisma.unit.create({ data: { code: `U-T${stamp}`, type: "Rent", project: `${C} مشروع`, area: "التجمع الخامس", space: 300, condition: "Finished", pdfStatus: "confirmed", agentId: ali.id } })).id;
  const r = await call("/deals", { method: "POST", cookie: mohsen, body: { leadId, unitId, space: 300, type: "Rent", commissionOwner: "50000", commissionClient: "50000", withMe: [eidId] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  dealId = r.body.id;
  assert.equal((await call(`/deals/${dealId}/review`, { method: "POST", cookie: nancy, body: { decision: "approve" } })).status, 200);
  bankId = (await fresh(ashraf, C, "112", "بنك")).id;
  revenueId = (await fresh(ashraf, C, "41", "عمولات")).id;
});

after(async () => {
  const tcrs = (await prisma.tcr.findMany({ where: { dealId }, select: { id: true } })).map((t) => t.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: tcrs } } });
  await prisma.tcr.deleteMany({ where: { dealId } });
  await prisma.payment.deleteMany({ where: { dealId } });
  const entries = (await prisma.journalEntry.findMany({ where: { sourceId: dealId }, select: { id: true } })).map((e) => e.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: entries } } });
  await prisma.journalEntry.deleteMany({ where: { id: { in: entries } } });
  await cleanFinance(C, since);
  await prisma.auditLog.deleteMany({ where: { entityId: dealId } });
  await prisma.deal.deleteMany({ where: { id: dealId } });
  const files = (await prisma.lead.findMany({ where: { code: `L-T${stamp}`, clientId: { not: null } }, select: { clientId: true } })).map((l) => l.clientId!);
  await prisma.lead.deleteMany({ where: { code: `L-T${stamp}` } });
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: files } } });
  await prisma.client.deleteMany({ where: { id: { in: files }, leads: { none: {} }, units: { none: {} } } });
  await prisma.unit.deleteMany({ where: { code: `U-T${stamp}` } });
  await prisma.$disconnect();
});

const collect = (body: object) => call(`/deals/${dealId}/collections`, { method: "POST", cookie: ashraf, body });
const sign = (cookie: string, tcrId: string) => call(`/deals/${dealId}/tcrs/${tcrId}/sign`, { method: "POST", cookie });
const pdf = async (cookie: string, tcrId: string) => {
  const r = await fetch(`${API}/deals/${dealId}/tcrs/${tcrId}/pdf`, { headers: { cookie } });
  await r.arrayBuffer();
  return { status: r.status, type: r.headers.get("content-type") };
};

test("5.12: a collection makes a TCR (T…) dated that day, with an unsigned line for each Buyer; the sheet shows its month and code", async () => {
  const r = await collect({ side: "client", toId: bankId, amount: "30000", revenueId, date: "2026-11-02" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.tcr, /^T\d+$/);
  const d = (await call(`/deals/${dealId}`, { cookie: mohsen })).body;
  assert.equal(d.tcrs.length, 1);
  first = d.tcrs[0];
  assert.equal(first.code, r.body.tcr);
  assert.deepEqual({ date: d.tcrs[0].date, side: d.tcrs[0].side, amount: d.tcrs[0].amount }, { date: "2026-11-02", side: "client", amount: "30000.00" });
  assert.deepEqual(d.tcrs[0].signatures.map((s: { id: string; side: string; signedAt: null }) => [s.id, s.side, s.signedAt]).sort(), [[eidId, "buyer", null], [mohsenId, "buyer", null]].sort());
  const row = (await call(`/deals?q=${encodeURIComponent(C)}`, { cookie: mohsen })).body.items[0];
  assert.equal(row.month, "2026-11");
  assert.deepEqual(row.tcrs, [first.code]);
  assert.ok(await prisma.notification.findFirst({ where: { text: { contains: `${first.code}: TCR جديدة على` } } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: dealId, action: "collect", after: { path: ["tcr"], equals: first.code } } }));
});

test("5.12: only a salesperson on the TCR signs it, once; HR can't reach it", async () => {
  assert.equal((await sign(hr, first.id)).status, 403);
  assert.equal((await sign(ashraf, first.id)).status, 400); // sees the deal, not on the TCR
  const r = await sign(mohsen, first.id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const line = r.body.tcrs[0].signatures.find((s: { id: string }) => s.id === mohsenId);
  assert.ok(line.signedAt);
  assert.equal(r.body.tcrs[0].signatures.find((s: { id: string }) => s.id === eidId).signedAt, null);
  assert.equal((await sign(mohsen, first.id)).status, 400); // already signed
  assert.equal((await sign(eid, first.id)).status, 200);
  assert.equal(await prisma.auditLog.count({ where: { module: "deals", entity: "Tcr", entityId: first.id, action: "sign" } }), 2);
});

test("5.12: more collected later = a second TCR on the same deal, later in the sequence, to sign again", async () => {
  // not all of it: fully collected posts commissions on the salespeople's shared accounts (5.3's test covers that)
  const r = await collect({ side: "owner", toId: bankId, amount: "20000" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(Number(r.body.tcr.slice(1)) > Number(first.code.slice(1)));
  const d = (await call(`/deals/${dealId}`, { cookie: mohsen })).body;
  assert.deepEqual(d.tcrs.map((t: { code: string }) => t.code), [first.code, r.body.tcr]);
  assert.ok(d.tcrs[1].signatures.every((s: { signedAt: string | null }) => s.signedAt === null));
  assert.equal(d.month, "2026-11"); // still the first collection's month
});

test("5.13: the TCR prints as a PDF for whoever sees the deal; HR gets 403; an unknown TCR is 404", async () => {
  const p = await pdf(mohsen, first.id);
  assert.equal(p.status, 200);
  assert.equal(p.type, "application/pdf");
  assert.equal((await pdf(ashraf, first.id)).status, 200);
  assert.equal((await pdf(hr, first.id)).status, 403);
  assert.equal((await pdf(mohsen, "nope")).status, 404);
});
