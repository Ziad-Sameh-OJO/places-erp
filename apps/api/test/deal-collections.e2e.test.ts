/**
 * 5.3 · 9.12 (the accountant's meeting, 4 Nov) against the real API and database: the Office Manager approves a deal →
 * the client gets an account under 113; the accountant records collections as receive vouchers into a bank → the
 * deal moves Approved → Partially → Fully Collected, the client's account goes down and the bank up; fully collected →
 * each salesperson's commission is due on their own account under 21103.
 * Mohsen (sales) closes it; Nancy (Office Manager) approves; Ahmed Ashraf (accountant) collects.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { balance, chart, cents, cleanFinance, find, fresh } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E-COL ${stamp}`;
const since = new Date();
let mohsen: string, nancy: string, ashraf: string, oldPct: unknown;
let dealId: string, bankId: string, revenueId: string, clientAccountId: string, mohsenId: string;

before(async () => {
  [mohsen, nancy, ashraf] = await Promise.all(["m.mohsen@places.com", "nancy.islam@places.com", "ahmed.ashraf@places.com"].map((e) => session(e)));
  const m = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  const ali = await prisma.employee.findFirstOrThrow({ where: { user: { email: "ahmed.ali@places.com" } } });
  mohsenId = m.id;
  oldPct = m.commissionPct;
  await prisma.employee.update({ where: { id: m.id }, data: { commissionPct: 30 } }); // the scheme isn't seeded (HR enters it)
  const leadId = (await prisma.lead.create({ data: {
    code: `L-C${stamp}`, name: `${C} عميل`, phones: [`0104${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    assignedToId: m.id, assignedAt: new Date(), createdById: "e2e", stage: "NEAR_TO_CLOSE", qualified: true, createdAt: new Date(Date.now() - 3 * 24 * 3_600_000),
  } })).id;
  const unitId = (await prisma.unit.create({ data: { code: `U-C${stamp}`, type: "Rent", project: `${C} مشروع`, area: "التجمع الخامس", space: 300, condition: "Finished", pdfStatus: "confirmed", agentId: ali.id } })).id;
  const r = await call("/deals", { method: "POST", cookie: mohsen, body: { leadId, unitId, space: 300, type: "Rent", commissionOwner: "50000", commissionClient: "50000", withMe: [] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  dealId = r.body.id;
  bankId = (await fresh(ashraf, C, "112", "بنك")).id;
  revenueId = (await fresh(ashraf, C, "41", "عمولات")).id;
});

after(async () => {
  await prisma.employee.update({ where: { id: mohsenId }, data: { commissionPct: oldPct as number } });
  await prisma.tcr.deleteMany({ where: { dealId } }); // each collection's TCR (5.12)
  await prisma.payment.deleteMany({ where: { dealId } });
  const tl = (await prisma.employee.findUniqueOrThrow({ where: { id: mohsenId } })).teamLeaderId ?? "-";
  // 5.8: the TL's share posted by these collections too
  const posted = (await prisma.journalEntry.findMany({ where: { OR: [{ sourceId: dealId }, { source: "tl-commission", sourceId: { startsWith: `${tl}:` }, createdAt: { gte: since } }] }, select: { id: true } })).map((e) => e.id);
  const entries = [...posted, ...(await prisma.journalEntry.findMany({ where: { source: "reversal", sourceId: { in: posted } }, select: { id: true } })).map((e) => e.id)];
  await prisma.auditLog.deleteMany({ where: { entityId: { in: entries } } });
  await prisma.journalEntry.deleteMany({ where: { id: { in: entries } } });
  const sales = (await prisma.account.findMany({ where: { partyType: "sales", partyId: { in: [mohsenId, tl] }, createdAt: { gte: since } }, select: { id: true } })).map((a) => a.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: sales } } });
  await prisma.account.deleteMany({ where: { id: { in: sales } } });
  await cleanFinance(C, since);
  await prisma.auditLog.deleteMany({ where: { entityId: dealId } });
  await prisma.deal.deleteMany({ where: { id: dealId } });
  const files = (await prisma.lead.findMany({ where: { code: `L-C${stamp}`, clientId: { not: null } }, select: { clientId: true } })).map((l) => l.clientId!);
  await prisma.lead.deleteMany({ where: { code: `L-C${stamp}` } });
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: files } } });
  await prisma.client.deleteMany({ where: { id: { in: files }, leads: { none: {} }, units: { none: {} } } });
  await prisma.unit.deleteMany({ where: { code: `U-C${stamp}` } });
  await prisma.$disconnect();
});

const collect = (cookie: string, body: object) => call(`/deals/${dealId}/collections`, { method: "POST", cookie, body });

test("9.12: the Office Manager's approval opens the client's own account under 113 (113001…), once", async () => {
  assert.equal((await collect(ashraf, { side: "client", toId: bankId, amount: "1000", revenueId })).status, 400); // not approved yet
  const r = await call(`/deals/${dealId}/review`, { method: "POST", cookie: nancy, body: { decision: "approve" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const acc = await prisma.account.findFirstOrThrow({ where: { name: `${C} عميل`, partyType: "client" } });
  assert.match(acc.code, /^113\d{3}$/);
  clientAccountId = acc.id;
  assert.equal(await prisma.auditLog.count({ where: { module: "finance", entity: "Account", entityId: acc.id, action: "create" } }), 1);
});

test("5.3: only finance records a collection; the first one needs the revenue line and can't go above what's left", async () => {
  assert.equal((await collect(mohsen, { side: "client", toId: bankId, amount: "30000", revenueId })).status, 403);
  assert.equal((await collect(nancy, { side: "client", toId: bankId, amount: "30000", revenueId })).status, 403);
  assert.equal((await collect(ashraf, { side: "client", toId: bankId, amount: "30000" })).status, 400); // no revenue line
  assert.equal((await collect(ashraf, { side: "client", toId: bankId, amount: "100000.01", revenueId })).status, 400);
  assert.equal((await collect(ashraf, { side: "client", toId: revenueId, amount: "30000", revenueId })).status, 400); // not a safe / bank
});

test("5.3 · 9.12: collecting 30,000 → Partially Collected, the client's account −30,000, the bank +30,000, 113 = its sub-accounts", async () => {
  const r = await collect(ashraf, { side: "client", toId: bankId, amount: "30000", revenueId });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, "Partially Collected");
  assert.equal(r.body.collected, "30000.00");
  assert.equal(r.body.remaining, "70000.00");
  assert.match(r.body.move, /^MV-\d+$/);
  assert.equal(await balance(ashraf, bankId), cents("30000"));
  assert.equal(await balance(ashraf, revenueId), cents("100000")); // Q37–Q39: the whole commission from the first collection
  assert.equal(await balance(ashraf, clientAccountId), cents("70000")); // 100,000 owed − 30,000 collected
  const move = await prisma.treasuryMove.findFirstOrThrow({ where: { no: Number(r.body.move.slice(3)) } });
  assert.equal(move.kind, "receive");
  assert.equal(move.accountId, clientAccountId);
  const ar = find(await chart(ashraf), "113")!;
  assert.equal(cents(ar.balance), ar.children.reduce((s, c) => s + cents(c.balance), 0));
  assert.equal((await call(`/deals/${dealId}`, { cookie: ashraf })).body.status, "Partially Collected");
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "deals", entityId: dealId, action: "collect" } }));
});

test("5.3 · 9.12: the rest → Fully Collected; each salesperson's commission is due under 21103; nothing more to collect", async () => {
  const r = await collect(ashraf, { side: "owner", toId: bankId, amount: "70000" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, "Fully Collected");
  assert.equal(await balance(ashraf, clientAccountId), 0);
  assert.equal(await balance(ashraf, revenueId), cents("100000")); // revenue booked once
  const due = await prisma.account.findUniqueOrThrow({ where: { partyType_partyId: { partyType: "sales", partyId: mohsenId } } });
  assert.match(due.code, /^21103\d{2}$/);
  // the only Buyer takes the Buyer half (50,000) at a 30% scheme; the Seller waits for Manar (5.5)
  assert.equal(await balance(ashraf, due.id), cents("15000"));
  assert.equal((await collect(ashraf, { side: "owner", toId: bankId, amount: "1" })).status, 400);
});

test("12 · 9.6: cancelling the collected deal reverses its revenue and commission once; the cash stays owed to the client", async () => {
  const cancel = (cookie: string, reason = "العميل رجع في كلامه") => call(`/deals/${dealId}/cancel`, { method: "POST", cookie, body: { reason } });
  assert.equal((await cancel(mohsen)).status, 403);
  assert.equal((await cancel(ashraf)).status, 403);
  assert.equal((await cancel(nancy, " ")).status, 400);
  const r = await cancel(nancy);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "Cancelled");
  assert.equal(r.body.reversed.length, 3); // the revenue, the operations commission (9.6) and the sales commission entries
  const due = await prisma.account.findUniqueOrThrow({ where: { partyType_partyId: { partyType: "sales", partyId: mohsenId } } });
  assert.equal(await balance(ashraf, revenueId), 0);
  assert.equal(await balance(ashraf, due.id), 0);
  assert.equal(await balance(ashraf, clientAccountId), -cents("100000")); // the collected cash is now owed back to the client
  assert.equal(await balance(ashraf, bankId), cents("100000"));
  assert.equal((await cancel(nancy)).status, 400); // once
  const posted = (await prisma.journalEntry.findMany({ where: { sourceId: dealId }, select: { id: true } })).map((e) => e.id);
  assert.equal(await prisma.journalEntry.count({ where: { source: "reversal", sourceId: { in: posted } } }), 3);
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "deals", entityId: dealId, action: "cancel" } }));
});
