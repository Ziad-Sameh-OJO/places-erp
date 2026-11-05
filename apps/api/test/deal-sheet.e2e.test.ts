/**
 * 5.9–5.11 against the real API and database: the deals sheet with its collections and split per salesperson,
 * «لوحة الإيرادات», the Achievements ranking, «سجّل تحصيل»'s revenue lines and the «تفاصيل الصفقات» export.
 * Ibrahim (sales) closes the deal; Nancy (Office Manager) approves; Ahmed Ashraf (accountant) collects 40,000.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";
import { cleanFinance, fresh } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E-SHEET ${stamp}`;
const since = new Date();
let sales: string, other: string, nancy: string, ashraf: string, hr: string, oldPct: unknown;
let dealId: string, salesId: string;

before(async () => {
  [sales, other, nancy, ashraf, hr] = await Promise.all(["ibrahim.samir@places.com", "omar.gamal@places.com", "nancy.islam@places.com", "ahmed.ashraf@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const m = await prisma.employee.findFirstOrThrow({ where: { user: { email: "ibrahim.samir@places.com" } } });
  const agent = await prisma.employee.findFirstOrThrow({ where: { user: { email: "abdelrahman.salah@places.com" } } });
  salesId = m.id;
  oldPct = m.commissionPct;
  await prisma.employee.update({ where: { id: m.id }, data: { commissionPct: 20 } });
  const leadId = (await prisma.lead.create({ data: {
    code: `L-S${stamp}`, name: `${C} عميل`, phones: [`0105${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    assignedToId: m.id, assignedAt: new Date(), createdById: "e2e", stage: "NEAR_TO_CLOSE", qualified: true, createdAt: new Date(Date.now() - 3 * 24 * 3_600_000),
  } })).id;
  const unitId = (await prisma.unit.create({ data: { code: `U-S${stamp}`, type: "Rent", project: `${C} مشروع`, area: "التجمع الخامس", space: 200, condition: "Finished", pdfStatus: "confirmed", agentId: agent.id } })).id;
  const r = await call("/deals", { method: "POST", cookie: sales, body: { leadId, unitId, space: 200, type: "Rent", commissionOwner: "50000", commissionClient: "50000", withMe: [] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  dealId = r.body.id;
  assert.equal((await call(`/deals/${dealId}/review`, { method: "POST", cookie: nancy, body: { decision: "approve" } })).status, 200);
  const bankId = (await fresh(ashraf, C, "112", "بنك")).id;
  const revenueId = (await fresh(ashraf, C, "41", "عمولات")).id;
  const c = await call(`/deals/${dealId}/collections`, { method: "POST", cookie: ashraf, body: { side: "client", toId: bankId, amount: "40000", revenueId } });
  assert.equal(c.status, 201, JSON.stringify(c.body));
});

after(async () => {
  await prisma.employee.update({ where: { id: salesId }, data: { commissionPct: oldPct as number } });
  await prisma.tcr.deleteMany({ where: { dealId } }); // each collection's TCR (5.12)
  await prisma.payment.deleteMany({ where: { dealId } });
  const tl = (await prisma.employee.findUniqueOrThrow({ where: { id: salesId } })).teamLeaderId ?? "-";
  // 5.8: the TL's share posted by the collection too
  const posted = (await prisma.journalEntry.findMany({ where: { OR: [{ sourceId: dealId }, { source: "tl-commission", sourceId: { startsWith: `${tl}:` }, createdAt: { gte: since } }] }, select: { id: true } })).map((e) => e.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: posted } } });
  await prisma.journalEntry.deleteMany({ where: { id: { in: posted } } });
  const accounts = (await prisma.account.findMany({ where: { partyType: "sales", partyId: { in: [salesId, tl] }, createdAt: { gte: since } }, select: { id: true } })).map((a) => a.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: accounts } } });
  await prisma.account.deleteMany({ where: { id: { in: accounts } } });
  await cleanFinance(C, since);
  await prisma.auditLog.deleteMany({ where: { entityId: dealId } });
  await prisma.auditLog.deleteMany({ where: { entityId: "split-export", at: { gte: since } } });
  await prisma.deal.deleteMany({ where: { id: dealId } });
  const files = (await prisma.lead.findMany({ where: { code: `L-S${stamp}`, clientId: { not: null } }, select: { clientId: true } })).map((l) => l.clientId!);
  await prisma.lead.deleteMany({ where: { code: `L-S${stamp}` } });
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: files } } });
  await prisma.client.deleteMany({ where: { id: { in: files }, leads: { none: {} }, units: { none: {} } } });
  await prisma.unit.deleteMany({ where: { code: `U-S${stamp}` } });
  await prisma.$disconnect();
});

test("5.9: the sheet shows the deal's collections by side and its split; the Seller waits for Manar so the Buyer takes the Buyer half", async () => {
  const r = await call("/deals/sheet", { cookie: sales });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body.items.find((x: { id: string }) => x.id === dealId);
  assert.ok(d);
  assert.equal(d.status, "Partially Collected");
  assert.deepEqual([d.collectedClient, d.collectedOwner, d.collected, d.remaining], ["40000.00", "0.00", "40000.00", "60000.00"]);
  assert.equal(d.payments.length, 1);
  assert.deepEqual(d.shares.map((s: { salesId: string; side: string; share: string; targetShare: string; commission: string }) => [s.salesId, s.side, s.share, s.targetShare, s.commission]),
    [[salesId, "buyer", "20000.00", "20000.00", "4000.00"]]);
  // «لوحة الإيرادات» counts this deal: the salesperson's scope holds only his own deals
  assert.ok(Number(r.body.totals.expected) >= 100000 && Number(r.body.totals.collected) >= 40000);
});

test("5.9: the scope is in the query — another salesperson doesn't see the deal; HR can't open the sheet", async () => {
  const r = await call("/deals/sheet", { cookie: other });
  assert.equal(r.status, 200);
  assert.ok(!r.body.items.some((x: { id: string }) => x.id === dealId));
  assert.equal((await call("/deals/sheet", { cookie: hr })).status, 403);
});

test("5.10: Achievements ranks every salesperson for the month, for any salesperson; not for HR", async () => {
  const r = await call("/deals/achievements", { cookie: other });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const me = r.body.rows.find((x: { employeeId: string }) => x.employeeId === salesId);
  assert.ok(me && me.rank >= 1 && Number(me.achieved) >= 20000 && me.transactions >= 1);
  assert.ok(!("pending" in me));
  assert.equal((await call("/deals/achievements", { cookie: sales })).body.mine, salesId);
  assert.equal((await call("/deals/achievements", { cookie: hr })).status, 403);
  assert.equal((await call("/deals/achievements?month=2026-1", { cookie: sales })).status, 400);
});

test("5.9: «سجّل تحصيل»'s revenue lines are Finance's", async () => {
  const r = await call("/deals/collect-form", { cookie: ashraf });
  assert.equal(r.status, 200);
  assert.ok(r.body.incomes.every((x: { code: string }) => x.code.startsWith("41")));
  assert.equal((await call("/deals/collect-form", { cookie: sales })).status, 403);
});

test("5.11: «تفاصيل الصفقات» exports as Excel for «deals: export» and is audited; a salesperson can't", async () => {
  const res = await fetch(`${API}/deals/split/export`, { headers: { cookie: nancy } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /spreadsheetml/);
  assert.ok((await res.arrayBuffer()).byteLength > 0);
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "deals", entityId: "split-export", action: "export", at: { gte: since } } }));
  assert.equal((await call("/deals/split/export", { cookie: sales })).status, 403);
});
