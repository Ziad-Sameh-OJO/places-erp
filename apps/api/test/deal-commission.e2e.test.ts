/**
 * 5.4 · 5.8 against the real API and database, on a team of our own (a TL, a Buyer at a 30% scheme, a Seller at 20%,
 * targets 1,000,000 each): the client's example of 100,000 collected → the Buyer's half is 50,000 (commission 15,000);
 * the Seller (the unit's agent) waits for Manar; approved after full collection, their 10,000 is posted then. The TL's
 * balance under 21103 = the tier of the team's achievement (below 70% → 4%) × the team's share of what was collected.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { balance, cents, cleanFinance, fresh } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E-COM ${stamp}`;
const since = new Date();
let mohsen: string, nancy: string, ashraf: string, manar: string, admin: string;
let dealId: string, bankId: string, revenueId: string;
const people: Record<"tl" | "buyer" | "seller", { userId: string; id: string }> = {} as never;

async function person(key: "tl" | "buyer" | "seller", pct: number) {
  const u = await prisma.user.create({
    data: {
      // not @places.test: access.e2e removes those people at its end, while this file may still be running
      email: `e2e-com-${key}-${stamp}@commission.test`, status: "ACTIVE",
      ...(key === "tl" ? {} : { roles: { create: { primary: true, role: { connect: { key: "sales" } } } } }),
      employee: { create: { name: `${C} ${key}`, jobTitle: "Sales", department: "Sales", salary: 0, target: 1_000_000, commissionPct: pct, ...(key === "tl" ? {} : { teamLeaderId: people.tl.id }) } },
    },
    include: { employee: true },
  });
  people[key] = { userId: u.id, id: u.employee!.id };
}

before(async () => {
  [mohsen, nancy, ashraf, manar, admin] = await Promise.all(["m.mohsen@places.com", "nancy.islam@places.com", "ahmed.ashraf@places.com", "manar.ahmed@places.com", "ahmed.islam@places.com"].map((e) => session(e)));
  await person("tl", 0);
  await person("buyer", 30);
  await person("seller", 20);
  const unitId = (await prisma.unit.create({ data: { code: `U-M${stamp}`, type: "Rent", project: `${C} مشروع`, area: "التجمع الخامس", space: 200, condition: "Finished", pdfStatus: "confirmed", agentId: people.seller.id } })).id;
  dealId = (await prisma.deal.create({ data: {
    code: `D-M${stamp}`, unitId, type: "Rent", space: 200, location: `${C} مشروع`, company: `${C} شركة`, source: "Facebook", status: "APPROVED",
    commissionOwner: 50_000, commissionClient: 50_000, closedAt: new Date(), createdById: "e2e",
    participants: { create: [{ employeeId: people.buyer.id, side: "BUYER" }, { employeeId: people.seller.id, side: "SELLER", approved: false }] },
  } })).id;
  bankId = (await fresh(ashraf, C, "112", "بنك")).id;
  revenueId = (await fresh(ashraf, C, "41", "عمولات")).id;
});

after(async () => {
  await prisma.payment.deleteMany({ where: { dealId } });
  await prisma.journalEntry.deleteMany({ where: { source: "tl-commission", sourceId: { startsWith: `${people.tl.id}:` } } });
  await cleanFinance(C, since); // the client's, the bank, and everyone's 21103 account (named with the prefix) with their entries
  await prisma.auditLog.deleteMany({ where: { entityId: dealId } });
  await prisma.deal.deleteMany({ where: { id: dealId } });
  await prisma.unit.deleteMany({ where: { code: `U-M${stamp}` } });
  const users = Object.values(people).map((p) => p.userId);
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.employee.deleteMany({ where: { id: { in: [people.buyer.id, people.seller.id] } } });
  await prisma.employee.deleteMany({ where: { id: people.tl.id } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

const collect = (body: object) => call(`/deals/${dealId}/collections`, { method: "POST", cookie: ashraf, body });
const approveSeller = (cookie: string) => call(`/deals/${dealId}/seller`, { method: "POST", cookie });
const dueOf = async (id: string) => {
  const acc = await prisma.account.findUnique({ where: { partyType_partyId: { partyType: "sales", partyId: id } } });
  return acc ? balance(ashraf, acc.id) : 0;
};

test("5.8: the TL tiers are the Super Admin's setting; they must run from the lowest up and end with «وأكتر»", async () => {
  const tiers = [{ below: 70, percent: 4 }, { below: null, percent: 6 }];
  assert.equal((await call("/settings/tlTiers", { method: "PUT", cookie: mohsen, body: { value: tiers } })).status, 403);
  assert.equal((await call("/settings/tlTiers", { method: "PUT", cookie: nancy, body: { value: tiers } })).status, 403);
  assert.equal((await call("/settings/tlTiers", { method: "PUT", cookie: admin, body: { value: [{ below: 70, percent: 4 }, { below: 50, percent: 6 }] } })).status, 400);
  const r = await call("/settings/tlTiers", { method: "PUT", cookie: admin, body: { value: tiers } }); // the seeded value, so other files see no change
  assert.ok(r.status < 300, JSON.stringify(r.body));
  assert.deepEqual((await call("/settings", { cookie: mohsen })).body.tlTiers, tiers);
});

test("5.4: only Manar («inventory: approve») approves the Seller", async () => {
  assert.equal((await approveSeller(mohsen)).status, 403);
  assert.equal((await approveSeller(nancy)).status, 403);
  assert.equal((await approveSeller(ashraf)).status, 403);
});

test("5.8: every collection moves the TL's balance: 4% (team at 3% of 2,000,000) of the Buyer's share", async () => {
  const r = await collect({ side: "client", toId: bankId, amount: "60000", revenueId });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await dueOf(people.tl.id), cents("1200")); // 4% × 30,000 (the Buyer's half of 60,000)
  assert.equal(await dueOf(people.buyer.id), 0); // sales commission waits for full collection
  const full = await collect({ side: "owner", toId: bankId, amount: "40000" });
  assert.equal(full.body.status, "Fully Collected");
  assert.equal(await dueOf(people.buyer.id), cents("15000")); // 30% × 50,000
  assert.equal(await dueOf(people.seller.id), 0); // still waiting for Manar
  assert.equal(await dueOf(people.tl.id), cents("2000")); // 4% × 50,000
});

test("5.4: the Seller approved after full collection gets their commission then, and the TL their share of it", async () => {
  const r = await approveSeller(manar);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.sellers[0].approved, true);
  assert.equal(await dueOf(people.seller.id), cents("10000")); // 20% × 50,000
  assert.equal(await dueOf(people.buyer.id), cents("15000")); // unchanged
  assert.equal(await dueOf(people.tl.id), cents("4000")); // 4% × 100,000
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "deals", entityId: dealId, action: "approve-seller" } }));
  assert.ok(await prisma.notification.findFirst({ where: { userId: people.seller.userId, text: { contains: `D-M${stamp}` } } }));
  assert.equal((await approveSeller(manar)).status, 400); // nothing waiting any more
});
