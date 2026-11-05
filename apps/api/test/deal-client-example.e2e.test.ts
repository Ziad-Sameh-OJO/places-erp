/**
 * 5.14 · the client's example end to end against the real API and database: a 100,000 commission (50,000 owner +
 * 50,000 client) with two Buyers and one Seller (the unit's agent), everyone on a 30% scheme → shares 25,000 / 25,000 /
 * 50,000, commissions 7,500 / 7,500 / 15,000 under 21103. People of our own (no TL) so no shared balance moves:
 * Buyer A closes it with Buyer B; Nancy (Office Manager) approves; Ahmed Ashraf collects; Manar approves the Seller
 * between the two collections; Nancy cancels and every balance goes back to 0.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { hash } from "@node-rs/argon2";
import { PW, call, session } from "./helpers.ts";
import { balance, cents, cleanFinance, fresh } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E-EX ${stamp}`;
const since = new Date();
type Key = "a" | "b" | "seller";
const people = {} as Record<Key, { userId: string; id: string; cookie: string }>;
let nancy: string, ashraf: string, manar: string;
let leadId: string, unitId: string, dealId: string, bankId: string, revenueId: string;

async function person(key: Key) {
  const email = `e2e-ex-${key}-${stamp}@example-deal.test`; // not @places.test: access.e2e removes those at its end
  const u = await prisma.user.create({
    data: {
      email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: { primary: true, role: { connect: { key: "sales" } } } },
      employee: { create: { name: `${C} ${key}`, jobTitle: "Sales", department: "Sales", salary: 0, target: 1_000_000, commissionPct: 30 } },
    },
    include: { employee: true },
  });
  people[key] = { userId: u.id, id: u.employee!.id, cookie: await session(email) };
}

before(async () => {
  [nancy, ashraf, manar] = await Promise.all(["nancy.islam@places.com", "ahmed.ashraf@places.com", "manar.ahmed@places.com"].map((e) => session(e)));
  for (const k of ["a", "b", "seller"] as const) await person(k);
  leadId = (await prisma.lead.create({ data: {
    code: `L-X${stamp}`, name: `${C} عميل`, phones: [`0106${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    assignedToId: people.a.id, assignedAt: new Date(), createdById: "e2e", stage: "NEAR_TO_CLOSE", qualified: true, createdAt: new Date(Date.now() - 3 * 24 * 3_600_000),
  } })).id;
  unitId = (await prisma.unit.create({ data: { code: `U-X${stamp}`, type: "Rent", project: `${C} مشروع`, area: "التجمع الخامس", space: 250, condition: "Finished", pdfStatus: "confirmed", agentId: people.seller.id } })).id;
  bankId = (await fresh(ashraf, C, "112", "بنك")).id;
  revenueId = (await fresh(ashraf, C, "41", "عمولات")).id;
});

after(async () => {
  if (dealId) {
    const tcrs = (await prisma.tcr.findMany({ where: { dealId }, select: { id: true } })).map((t) => t.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [dealId, ...tcrs] } } });
    await prisma.tcr.deleteMany({ where: { dealId } });
    await prisma.payment.deleteMany({ where: { dealId } });
  }
  await cleanFinance(C, since); // the client's, the bank, everyone's 21103 account (named with the prefix) and their entries
  await prisma.deal.deleteMany({ where: { unitId } });
  const files = (await prisma.lead.findMany({ where: { id: leadId, clientId: { not: null } }, select: { clientId: true } })).map((l) => l.clientId!);
  await prisma.auditLog.deleteMany({ where: { entityId: leadId } });
  await prisma.lead.deleteMany({ where: { id: leadId } });
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: files } } });
  await prisma.client.deleteMany({ where: { id: { in: files }, leads: { none: {} }, units: { none: {} } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  const users = Object.values(people).map((p) => p.userId);
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.employee.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

const collect = (body: object) => call(`/deals/${dealId}/collections`, { method: "POST", cookie: ashraf, body });
const deal = async () => (await call(`/deals/${dealId}`, { cookie: people.a.cookie })).body;
const dueOf = async (k: Key) => {
  const acc = await prisma.account.findUnique({ where: { partyType_partyId: { partyType: "sales", partyId: people[k].id } } });
  return acc ? balance(ashraf, acc.id) : 0;
};
const dues = async () => ({ a: await dueOf("a"), b: await dueOf("b"), seller: await dueOf("seller") });
const lines = (t: { signatures: { id: string; side: string }[] }) => t.signatures.map((s) => `${s.side}:${s.id}`).sort();

test("Done Deal: Buyer A closes 100,000 with Buyer B; the unit's agent is the Seller, waiting for Manar", async () => {
  const r = await call("/deals", { method: "POST", cookie: people.a.cookie, body: { leadId, unitId, space: 250, type: "Rent", commissionOwner: "50000", commissionClient: "50000", withMe: [people.b.id] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  dealId = r.body.id;
  assert.equal(r.body.status, "Pending Review");
  assert.deepEqual(r.body.buyers.map((p: { id: string }) => p.id).sort(), [people.a.id, people.b.id].sort());
  assert.deepEqual(r.body.sellers.map((s: { id: string; approved: boolean }) => [s.id, s.approved]), [[people.seller.id, false]]);
});

test("Office Manager approval: Buyer A and the accountant can't; Nancy can", async () => {
  const review = (cookie: string) => call(`/deals/${dealId}/review`, { method: "POST", cookie, body: { decision: "approve" } });
  assert.equal((await review(people.a.cookie)).status, 403);
  assert.equal((await review(ashraf)).status, 403);
  const r = await review(nancy);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "Approved");
});

test("partial collection (40,000): Partially Collected, a TCR with a line per Buyer, nothing due yet", async () => {
  assert.equal((await call(`/deals/${dealId}/collections`, { method: "POST", cookie: people.a.cookie, body: { side: "client", toId: bankId, amount: "40000", revenueId } })).status, 403);
  const r = await collect({ side: "client", toId: bankId, amount: "40000", revenueId });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, "Partially Collected");
  assert.equal(r.body.remaining, "60000.00");
  const d = await deal();
  assert.equal(d.tcrs.length, 1);
  assert.equal(d.tcrs[0].amount, "40000.00");
  assert.deepEqual(lines(d.tcrs[0]), [`buyer:${people.a.id}`, `buyer:${people.b.id}`].sort()); // the Seller isn't approved yet
  assert.deepEqual(await dues(), { a: 0, b: 0, seller: 0 });
});

test("Manar approves the Seller (Nancy can't); still nothing due before full collection", async () => {
  assert.equal((await call(`/deals/${dealId}/seller`, { method: "POST", cookie: nancy })).status, 403);
  const r = await call(`/deals/${dealId}/seller`, { method: "POST", cookie: manar });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.sellers[0].approved, true);
  assert.deepEqual(await dues(), { a: 0, b: 0, seller: 0 });
});

test("full collection (60,000): Fully Collected; the second TCR has all three lines; 21103 = 30% of 25,000 / 25,000 / 50,000", async () => {
  const r = await collect({ side: "owner", toId: bankId, amount: "60000" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, "Fully Collected");
  assert.equal(r.body.remaining, "0.00");
  const d = await deal();
  assert.equal(d.tcrs.length, 2);
  assert.equal(d.tcrs[1].amount, "60000.00");
  assert.deepEqual(lines(d.tcrs[1]), [`buyer:${people.a.id}`, `buyer:${people.b.id}`, `seller:${people.seller.id}`].sort());
  assert.deepEqual(await dues(), { a: cents("7500"), b: cents("7500"), seller: cents("15000") });
  assert.equal((await collect({ side: "owner", toId: bankId, amount: "1" })).status, 400); // nothing left
});

test("cancel: Buyer A can't; Nancy cancels with a reason and every 21103 balance returns to 0", async () => {
  const body = { reason: `${C} إلغاء` };
  assert.equal((await call(`/deals/${dealId}/cancel`, { method: "POST", cookie: people.a.cookie, body })).status, 403);
  const r = await call(`/deals/${dealId}/cancel`, { method: "POST", cookie: nancy, body });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "Cancelled");
  assert.deepEqual(await dues(), { a: 0, b: 0, seller: 0 });
  assert.equal((await deal()).status, "Cancelled");
});
