/**
 * 9.15 · 5.7 against the real API and database, on a team of our own (a TL and a Buyer at a 30% scheme): 100,000
 * collected → the Buyer's commission 15,000 is due on their 21103 account; the accountant pays it with «صرف عمولة سيلز»
 * against a TCR (Dr 21103 / Cr the bank), then the TL's 2,000 (4% × 50,000) without a deal. Cancelling the deal afterwards
 * reverses everything: the paid commission is owed back, and the deal drops out of «الـ Transactions».
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { localDate } from "@places/domain";
import { call, session } from "./helpers.ts";
import { balance, cents, cleanFinance, fresh } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E-PAY ${stamp}`;
const code = `D-P${stamp}`;
const since = new Date();
let mohsen: string, nancy: string, ashraf: string, ashrafListed = "";
let dealId: string, bankId: string, revenueId: string, otherDealTcr: string;
const people: Record<"tl" | "buyer", { userId: string; id: string }> = {} as never;

async function person(key: "tl" | "buyer", pct: number) {
  const u = await prisma.user.create({
    data: {
      email: `e2e-pay-${key}-${stamp}@commission.test`, status: "ACTIVE",
      ...(key === "tl" ? {} : { roles: { create: { primary: true, role: { connect: { key: "sales" } } } } }),
      employee: { create: { name: `${C} ${key}`, jobTitle: "Sales", department: "Sales", salary: 0, target: 1_000_000, commissionPct: pct, ...(key === "tl" ? {} : { teamLeaderId: people.tl.id }) } },
    },
    include: { employee: true },
  });
  people[key] = { userId: u.id, id: u.employee!.id };
}

before(async () => {
  [mohsen, nancy, ashraf] = await Promise.all(["m.mohsen@places.com", "nancy.islam@places.com", "ahmed.ashraf@places.com"].map((e) => session(e)));
  // 11.20: «التقارير والتارجت» is the heads' — a head opened it for the accountant (the Transactions sheet)
  const a = await prisma.user.findUniqueOrThrow({ where: { email: "ahmed.ashraf@places.com" } });
  if (!(await prisma.reportsAccess.findUnique({ where: { userId: a.id } }))) { await prisma.reportsAccess.create({ data: { userId: a.id, grantedById: a.id } }); ashrafListed = a.id; }
  await person("tl", 0);
  await person("buyer", 30);
  const unitId = (await prisma.unit.create({ data: { code: `U-P${stamp}`, type: "Rent", project: `${C} مشروع`, area: "التجمع الخامس", space: 200, condition: "Finished", pdfStatus: "confirmed" } })).id;
  dealId = (await prisma.deal.create({ data: {
    code, unitId, type: "Rent", space: 200, location: `${C} مشروع`, company: `${C} شركة`, source: "Facebook", status: "APPROVED",
    commissionOwner: 50_000, commissionClient: 50_000, closedAt: new Date(), createdById: "e2e",
    participants: { create: [{ employeeId: people.buyer.id, side: "BUYER" }] },
  } })).id;
  otherDealTcr = (await prisma.tcr.findFirst({ where: { dealId: { not: dealId } }, select: { id: true } }))?.id ?? "x";
  bankId = (await fresh(ashraf, C, "112", "بنك")).id;
  revenueId = (await fresh(ashraf, C, "41", "عمولات")).id;
});

after(async () => {
  if (ashrafListed) await prisma.reportsAccess.deleteMany({ where: { userId: ashrafListed } });
  const users = Object.values(people).map((p) => p.userId);
  const ids = Object.values(people).map((p) => p.id);
  const payouts = (await prisma.commissionPayout.findMany({ where: { employeeId: { in: ids } }, select: { id: true } })).map((p) => p.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: payouts } } });
  await prisma.commissionPayout.deleteMany({ where: { id: { in: payouts } } });
  await prisma.tcr.deleteMany({ where: { dealId } });
  await prisma.payment.deleteMany({ where: { dealId } });
  await prisma.journalEntry.deleteMany({ where: { source: "tl-commission", sourceId: { startsWith: `${people.tl.id}:` } } });
  await cleanFinance(C, since); // the client's, the bank, both 21103 accounts (named with the prefix) with their entries and vouchers
  await prisma.auditLog.deleteMany({ where: { entityId: dealId } });
  await prisma.deal.deleteMany({ where: { id: dealId } });
  await prisma.unit.deleteMany({ where: { code: `U-P${stamp}` } });
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: users } }, { text: { contains: code } }] } });
  await prisma.employee.deleteMany({ where: { id: people.buyer.id } });
  await prisma.employee.deleteMany({ where: { id: people.tl.id } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

const collect = (body: object) => call(`/deals/${dealId}/collections`, { method: "POST", cookie: ashraf, body });
const pay = (body: object, cookie = ashraf) => call("/finance/commissions/payouts", { method: "POST", cookie, body: { fromId: bankId, ...body } });
const statement = async (id: string) => (await call(`/finance/commissions/${id}`, { cookie: ashraf })).body;
const dueOf = async (id: string) => {
  const acc = await prisma.account.findUnique({ where: { partyType_partyId: { partyType: "sales", partyId: id } } });
  return acc ? balance(ashraf, acc.id) : 0;
};
const today = localDate(new Date());
const transactions = async () => (await call(`/reports/transactions?from=${today.slice(0, 8)}01&to=${today}`, { cookie: ashraf })).body as Array<{ dealId: string }>;

test("9.15: «finance: view» sees the statement, only «finance: create» pays commission", async () => {
  assert.equal((await call(`/finance/commissions/${people.buyer.id}`, { cookie: mohsen })).status, 403);
  assert.equal((await call("/finance/commissions", { cookie: mohsen })).status, 403);
  assert.equal((await call(`/finance/commissions/${people.buyer.id}`, { cookie: nancy })).status, 200); // the approver role views finance
  assert.equal((await pay({ employeeId: people.buyer.id, dealId, amount: "1" }, mohsen)).status, 403);
  assert.equal((await pay({ employeeId: people.buyer.id, dealId, amount: "1" }, nancy)).status, 403);
});

test("9.15: partly collected → nothing due yet («مستنية باقي التحصيل»), a payout is refused", async () => {
  assert.equal((await collect({ side: "client", toId: bankId, amount: "60000", revenueId })).status, 201);
  const s = await statement(people.buyer.id);
  assert.equal(s.deals.length, 1);
  assert.match(s.deals[0].state, /^مستنية باقي التحصيل/);
  assert.equal(s.deals[0].due, "0.00");
  assert.equal((await pay({ employeeId: people.buyer.id, dealId, amount: "1" })).status, 400);
});

test("9.15: fully collected → the accountant is told; the Buyer's 15,000 is due on the deal with both TCRs to sign", async () => {
  const r = await collect({ side: "owner", toId: bankId, amount: "40000" });
  assert.equal(r.body.status, "Fully Collected");
  const accountant = await prisma.user.findUniqueOrThrow({ where: { email: "ahmed.ashraf@places.com" } });
  assert.ok(await prisma.notification.findFirst({ where: { userId: accountant.id, text: { contains: `${code} اتحصّلت بالكامل` } } }));
  const s = await statement(people.buyer.id);
  assert.equal(s.balance, "15000.00");
  const list = (await call("/finance/commissions", { cookie: ashraf })).body as Array<{ employeeId: string; balance: string }>;
  assert.equal(list.find((p) => p.employeeId === people.buyer.id)?.balance, "15000.00");
  assert.deepEqual([s.deals[0].commission, s.deals[0].paid, s.deals[0].due, s.deals[0].state], ["15000.00", "0.00", "15000.00", "مستحقة · اتحصّلت بالكامل"]);
  assert.deepEqual(s.deals[0].shares, [{ side: "buyer", schemePercent: 30, share: "50000.00" }]);
  assert.equal(s.deals[0].tcrs.length, 2);
  assert.ok(s.deals[0].tcrs.every((t: { signed: boolean }) => !t.signed));
});

test("9.15: never above what's due on the deal, never a TCR from another deal", async () => {
  assert.equal((await pay({ employeeId: people.buyer.id, dealId, amount: "15000.01" })).status, 400);
  assert.equal((await pay({ employeeId: people.buyer.id, dealId, tcrId: otherDealTcr, amount: "100" })).status, 400);
  assert.equal((await pay({ employeeId: people.buyer.id, dealId, amount: "100", fromId: revenueId })).status, 400); // not a safe / bank
});

test("9.15: paying 10,000 on the deal and its TCR → Dr his 21103 / Cr the bank; he's told to sign; then the rest → «اتصرفت»", async () => {
  const tcr = (await statement(people.buyer.id)).deals[0].tcrs[0];
  const r = await pay({ employeeId: people.buyer.id, dealId, tcrId: tcr.id, amount: "10000" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual([r.body.due, r.body.signed], ["5000.00", false]);
  assert.match(r.body.move, /^MV-\d+$/);
  assert.equal(await dueOf(people.buyer.id), cents("5000"));
  assert.equal(await balance(ashraf, bankId), cents("90000"));
  const move = await prisma.treasuryMove.findFirstOrThrow({ where: { no: Number(r.body.move.slice(3)) } });
  assert.equal(move.kind, "commission");
  assert.ok(await prisma.notification.findFirst({ where: { userId: people.buyer.userId, text: { contains: `امضي على ${tcr.code}` } } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "deals", entity: "CommissionPayout", action: "create", after: { path: ["deal"], equals: code } } }));
  const rest = await pay({ employeeId: people.buyer.id, dealId, amount: "5000" });
  assert.equal(rest.status, 201, JSON.stringify(rest.body));
  assert.equal(rest.body.due, "0.00");
  const s = await statement(people.buyer.id);
  assert.deepEqual([s.balance, s.deals[0].paid, s.deals[0].due, s.deals[0].state], ["0.00", "15000.00", "0.00", "اتصرفت"]);
  assert.deepEqual(s.payouts.map((p: { deal: string; tcr: string | null; amount: string }) => [p.deal, p.tcr, p.amount]), [[code, tcr.code, "10000.00"], [code, null, "5000.00"]]);
  assert.equal((await pay({ employeeId: people.buyer.id, dealId, amount: "1" })).status, 400); // nothing left
});

test("9.15 · 5.8: the TL's commission (4% × 50,000) is paid without a deal, once", async () => {
  const s = await statement(people.tl.id);
  assert.deepEqual([s.balance, s.tlDue, s.deals.length], ["2000.00", "2000.00", 0]);
  const r = await pay({ employeeId: people.tl.id, amount: "2000" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await dueOf(people.tl.id), 0);
  assert.equal((await pay({ employeeId: people.tl.id, amount: "1" })).status, 400);
});

test("5.7: cancelling after the payout reverses revenue and commission (now owed back) and drops the deal from the Transactions", async () => {
  assert.ok((await transactions()).some((t) => t.dealId === dealId));
  const r = await call(`/deals/${dealId}/cancel`, { method: "POST", cookie: nancy, body: { reason: `${C} إلغاء` } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await balance(ashraf, revenueId), 0);
  assert.equal(await dueOf(people.buyer.id), -cents("15000")); // paid already: the next payout takes it back
  assert.equal(await dueOf(people.tl.id), -cents("2000"));
  assert.ok(!(await transactions()).some((t) => t.dealId === dealId));
  assert.equal((await statement(people.buyer.id)).deals.length, 0);
});
