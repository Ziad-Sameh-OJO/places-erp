/**
 * 9.6 · 9.10 against the real API and database, on a campaign and a salesperson of our own: a 30,000 campaign with 2
 * Qualified leads (and 1 not), a deal on one of them, 100,000 Places commission, the Buyer at a 30% scheme.
 * The Office Manager writes a 2,000 external commission on the review; the first collection books operations 5% (5,000)
 * on 5303 and the 2,000 on 5304; the Cost Center shows marketing 15,000 and commissions 15,000 + 5,000 + 2,000.
 * Cancelling the deal reverses the direct costs and takes it off the report.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { cents, cleanFinance, fresh } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E-CC ${stamp}`;
const since = new Date();
let mohsen: string, nancy: string, ashraf: string, admin: string;
let dealId: string, campaignId: string, bankId: string, revenueId: string, buyer: { userId: string; id: string };

before(async () => {
  [mohsen, nancy, ashraf, admin] = await Promise.all(["m.mohsen@places.com", "nancy.islam@places.com", "ahmed.ashraf@places.com", "ahmed.islam@places.com"].map((e) => session(e)));
  const u = await prisma.user.create({
    data: { email: `e2e-cc-${stamp}@cost-center.test`, status: "ACTIVE", employee: { create: { name: `${C} buyer`, jobTitle: "Sales", department: "Sales", salary: 0, commissionPct: 30 } } },
    include: { employee: true },
  });
  buyer = { userId: u.id, id: u.employee!.id };
  campaignId = (await prisma.campaign.create({ data: { name: `${C} حملة`, channel: "LinkedIn", startsOn: new Date(), endsOn: new Date(), budget: 50_000, spent: 30_000 } })).id;
  const lead = (n: number, qualified: boolean) => prisma.lead.create({ data: {
    code: `L-CC${stamp}${n}`, name: `${C} عميل ${n}`, phones: [`010${n}${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent", channel: "LinkedIn", campaignId, qualified, createdById: "e2e",
  } });
  const [leadId] = await Promise.all([lead(1, true).then((l) => l.id), lead(2, true), lead(3, false)]);
  const unitId = (await prisma.unit.create({ data: { code: `U-CC${stamp}`, type: "Rent", project: `${C} مشروع`, area: "التجمع الخامس", space: 200, condition: "Finished", pdfStatus: "confirmed" } })).id;
  dealId = (await prisma.deal.create({ data: {
    code: `D-CC${stamp}`, leadId, unitId, type: "Rent", space: 200, location: `${C} مشروع`, company: `${C} شركة`, source: "LinkedIn", status: "PENDING_REVIEW",
    commissionOwner: 50_000, commissionClient: 50_000, closedAt: new Date(), createdById: "e2e",
    participants: { create: [{ employeeId: buyer.id, side: "BUYER" }] },
  } })).id;
  bankId = (await fresh(ashraf, C, "112", "بنك")).id;
  revenueId = (await fresh(ashraf, C, "41", "عمولات")).id;
});

after(async () => {
  const entries = (await prisma.journalEntry.findMany({ where: { source: "deal", sourceId: dealId }, select: { id: true } })).map((e) => e.id);
  await prisma.journalEntry.deleteMany({ where: { source: "reversal", sourceId: { in: entries } } });
  await prisma.tcr.deleteMany({ where: { dealId } });
  await prisma.payment.deleteMany({ where: { dealId } });
  await cleanFinance(C, since);
  await prisma.auditLog.deleteMany({ where: { entityId: dealId } });
  await prisma.deal.deleteMany({ where: { id: dealId } });
  await prisma.unit.deleteMany({ where: { code: `U-CC${stamp}` } });
  await prisma.lead.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.notification.deleteMany({ where: { userId: buyer.userId } });
  await prisma.employee.deleteMany({ where: { id: buyer.id } });
  await prisma.user.deleteMany({ where: { id: buyer.userId } });
  await prisma.$disconnect();
});

const report = (cookie: string) => call(`/finance/cost-center?campaignId=${campaignId}`, { cookie });
const direct = () => prisma.journalEntry.findFirst({ where: { source: "deal", sourceId: dealId, nature: "تكاليف الصفقة المباشرة" }, include: { lines: { include: { account: true } } } });

test("9.6: the operations and external rates are the Super Admin's settings (5% · 0 until the client confirms)", async () => {
  assert.equal((await call("/settings/opsCommissionPct", { method: "PUT", cookie: ashraf, body: { value: 5 } })).status, 403);
  assert.equal((await call("/settings/externalCommissionPct", { method: "PUT", cookie: nancy, body: { value: 0 } })).status, 403);
  assert.equal((await call("/settings/opsCommissionPct", { method: "PUT", cookie: admin, body: { value: 101 } })).status, 400);
  const r = await call("/settings/opsCommissionPct", { method: "PUT", cookie: admin, body: { value: 5 } }); // the default, so other files see no change
  assert.ok(r.status < 300, JSON.stringify(r.body));
  const s = (await call("/settings", { cookie: mohsen })).body;
  assert.equal(s.opsCommissionPct, 5);
  assert.equal(s.externalCommissionPct, 0);
});

test("9.6: the external commission is written on the review and audited", async () => {
  const r = await call(`/deals/${dealId}/review`, { method: "POST", cookie: nancy, body: { decision: "approve", externalCommission: "2000" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const a = await prisma.auditLog.findFirst({ where: { entityId: dealId, action: "approve" } });
  assert.deepEqual((a!.after as { externalCommission: string }).externalCommission, "2000.00");
});

test("9.6: the first collection books operations 5% on 5303 and the external 2,000 on 5304, once", async () => {
  const r = await call(`/deals/${dealId}/collections`, { method: "POST", cookie: ashraf, body: { side: "client", toId: bankId, amount: "60000", revenueId } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const e = await direct();
  const line = (code: string) => e!.lines.find((l) => l.account.code === code);
  assert.equal(line("5303")!.debit.toFixed(2), "5000.00");
  assert.equal(line("21104")!.credit.toFixed(2), "5000.00");
  assert.equal(line("5304")!.debit.toFixed(2), "2000.00");
  assert.equal(e!.lines.find((l) => l.account.name === "عمولات خارجية مستحقة")!.credit.toFixed(2), "2000.00");
  assert.equal((await call(`/deals/${dealId}/collections`, { method: "POST", cookie: ashraf, body: { side: "owner", toId: bankId, amount: "40000" } })).status, 201);
  assert.equal(await prisma.journalEntry.count({ where: { source: "deal", sourceId: dealId, nature: "تكاليف الصفقة المباشرة" } }), 1);
});

test("9.10: the Cost Center — finance sees it, sales doesn't; the campaign's 30,000 over 2 Qualified leads = 15,000 on the deal", async () => {
  assert.equal((await report(mohsen)).status, 403);
  const r = await report(ashraf);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.rows.length, 1);
  const row = r.body.rows[0];
  assert.equal(row.code, `D-CC${stamp}`);
  assert.equal(row.channel, "LinkedIn");
  assert.equal(row.campaign, `${C} حملة`);
  assert.equal(cents(row.revenue), cents("100000"));
  assert.equal(cents(row.marketing), cents("15000"));
  assert.equal(cents(row.commission), cents("22000")); // 30% × 50,000 + 5,000 + 2,000
  assert.equal(cents(row.net), cents("63000"));
  assert.deepEqual(r.body.byChannel, [{ channel: "LinkedIn", revenue: "100000.00", marketing: "15000.00" }]);
  assert.equal((await call(`/finance/cost-center?campaignId=${campaignId}&area=${encodeURIComponent("المعادي")}`, { cookie: ashraf })).body.rows.length, 0);
  assert.equal((await call(`/finance/cost-center?campaignId=${campaignId}&salesId=${buyer.id}`, { cookie: ashraf })).body.rows.length, 1);
});

test("9.6: cancelling the deal reverses the direct costs and takes it off the Cost Center", async () => {
  const r = await call(`/deals/${dealId}/cancel`, { method: "POST", cookie: nancy, body: { reason: `${C} إلغاء` } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await prisma.journalEntry.count({ where: { source: "reversal", sourceId: (await direct())!.id } }), 1);
  assert.equal((await report(ashraf)).body.rows.length, 0);
});
