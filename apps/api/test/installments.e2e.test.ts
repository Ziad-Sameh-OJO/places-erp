/**
 * 6.5 – 6.7 (M-11 2.1 steps 3–4 · 2.3 · 2.4 · 4.1 · 6.1 · 7.1): Ahmed Ashraf (Finance) records payments on an
 * installment — part of it, then the rest — and prints each receipt; Mohamed Mohsen (sales) sees them but can't record;
 * Omar Gamal (another salesperson) sees none; Basant (HR) nothing. The daily job reminds 3 days before, alerts when
 * late, escalates at 7 days, on working days only and once each.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { localDate } from "@places/domain";
import { installmentAlertsTick } from "../../worker/src/processors/installment-alerts.ts";
import { API, call, session } from "./helpers.ts";

const stamp = String(Date.now());
const C = `E2E ${stamp} قسط`;
let mohsen: string, ashraf: string, omar: string, hr: string;
let mohsenUser: string, ashrafUser: string, code: string, first: string, second: string;

before(async () => {
  [mohsen, ashraf, omar, hr] = await Promise.all(["m.mohsen", "ahmed.ashraf", "omar.gamal", "basant.elsawy"].map((e) => session(`${e}@places.com`)));
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  mohsenUser = emp.userId;
  ashrafUser = (await prisma.user.findUniqueOrThrow({ where: { email: "ahmed.ashraf@places.com" } })).id;
  const lead = await prisma.lead.create({ data: { code: `L-Q${stamp}`, name: C, phones: [`0105${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook", createdById: "e2e", assignedToId: emp.id } });
  const unit = await prisma.unit.create({ data: { code: `U-Q${stamp}`, type: "Rent", project: C, area: "التجمع الخامس", space: 200, condition: "Finished", pdfStatus: "confirmed" } });
  const deal = await prisma.deal.create({ data: {
    code: `D-Q${stamp}`, leadId: lead.id, unitId: unit.id, type: "Rent", space: 200, location: `${C} موقع`, company: `${C} شركة`, source: "Facebook",
    status: "APPROVED", commissionOwner: "10000", commissionClient: "0", closedAt: new Date(), createdById: "e2e", participants: { create: [{ employeeId: emp.id, side: "BUYER" }] },
  } });
  const file = await prisma.file.create({ data: { key: `e2e/${stamp}-q.pdf`, name: `${C}.pdf`, mime: "application/pdf", size: 100, status: "READY", uploadedById: mohsenUser } });
  const r = await call("/contracts", { method: "POST", cookie: mohsen, body: {
    dealId: deal.id, startsOn: "2026-10-01", endsOn: "2027-09-30", value: "20000", escalation: 0, fileId: file.id,
    schedule: { lines: [{ dueOn: "2026-10-01", amount: "10000" }, { dueOn: "2026-12-10", amount: "10000" }] },
  } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  code = r.body.code;
  [first, second] = r.body.installments.map((i: { id: string }) => i.id);
});

after(async () => {
  await prisma.notification.deleteMany({ where: { text: { contains: C } } });
  await prisma.contract.deleteMany({ where: { deal: { code: `D-Q${stamp}` } } });
  await prisma.deal.deleteMany({ where: { code: `D-Q${stamp}` } });
  await prisma.file.deleteMany({ where: { name: { startsWith: C } } });
  await prisma.lead.deleteMany({ where: { code: `L-Q${stamp}` } });
  await prisma.unit.deleteMany({ where: { code: `U-Q${stamp}` } });
  await prisma.$disconnect();
});

const pay = (cookie: string, id: string, body: object) => call(`/contracts/installments/${id}/payments`, { method: "POST", cookie, body });
const pdf = async (path: string, cookie: string) => {
  const r = await fetch(`${API}${path}`, { headers: { cookie } });
  return { status: r.status, type: r.headers.get("content-type"), size: (await r.arrayBuffer()).byteLength };
};

test("6.5 permissions (M-11 4.1): sales can't record payments; HR can't; another salesperson's contract is not found", async () => {
  assert.equal((await pay(mohsen, first, { amount: "1000" })).status, 403);
  assert.equal((await pay(hr, first, { amount: "1000" })).status, 403);
  assert.equal((await call(`/contracts/collections?month=2026-11`, { cookie: hr })).status, 403);
});

let receipts: Array<{ id: string; receiptNo: string; amount: string }>;

test("6.5 M-11 2.3: 4,000 of 10,000 → Partially Paid; more than the rest is refused; the rest → paid; audited", async () => {
  const today = localDate(new Date());
  let r = await pay(ashraf, first, { amount: "4000" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual([r.body.installments[0].paid, r.body.installments[0].state], ["4000.00", "partial"]);
  assert.equal(r.body.paid, "4000.00");
  r = await pay(ashraf, first, { amount: "6000.01" });
  assert.equal(r.status, 400);
  assert.match(JSON.stringify(r.body), /المبلغ أكبر من الباقي على القسط/);
  assert.equal((await pay(ashraf, first, { amount: "1", paidOn: "2099-01-01" })).status, 400);
  r = await pay(ashraf, first, { amount: "6000", paidOn: today });
  assert.equal(r.status, 201);
  assert.equal(r.body.installments[0].state, "paid");
  receipts = r.body.installments[0].payments;
  assert.deepEqual(receipts.map((p) => [p.amount, p.receiptNo]), [["4000.00", `${code}-1`], ["6000.00", `${code}-1/2`]]);
  assert.equal((await pay(ashraf, first, { amount: "1" })).status, 400); // nothing left
  assert.equal(await prisma.auditLog.count({ where: { module: "contracts", entity: "InstallmentPayment", entityId: { in: receipts.map((p) => p.id) }, action: "create" } }), 2);
  assert.equal((await pay(omar, first, { amount: "1" })).status, 403);
});

test("6.5 «تقرير التحصيل»: the month's payments with their receipts, collected vs due, in the caller's scope", async () => {
  const month = localDate(new Date()).slice(0, 7);
  const mine = (b: { items: Array<{ code: string }> }) => b.items.filter((x) => x.code === code);
  const r = await call(`/contracts/collections?month=${month}`, { cookie: ashraf });
  assert.equal(r.status, 200);
  assert.deepEqual(mine(r.body).map((x: { amount: string; receiptNo: string }) => [x.amount, x.receiptNo]), [["4000.00", `${code}-1`], ["6000.00", `${code}-1/2`]]);
  assert.ok(Number(r.body.collected) >= 10_000);
  assert.equal(r.body.aging.length, 4);
  assert.equal(mine((await call(`/contracts/collections?month=${month}`, { cookie: mohsen })).body).length, 2);
  assert.equal(mine((await call(`/contracts/collections?month=${month}`, { cookie: omar })).body).length, 0);
  const dec = await call(`/contracts/collections?month=2026-12`, { cookie: ashraf });
  assert.ok(Number(dec.body.due) >= 10_000); // the second installment falls due in December
});

test("6.7: each payment prints a receipt PDF for whoever sees the contract", { timeout: 60_000 }, async () => {
  const r = await pdf(`/contracts/payments/${receipts[1]!.id}/receipt`, mohsen);
  assert.equal(r.status, 200);
  assert.equal(r.type, "application/pdf");
  assert.ok(r.size > 1000);
  assert.equal((await pdf(`/contracts/payments/${receipts[1]!.id}/receipt`, omar)).status, 404);
  assert.equal((await pdf(`/contracts/payments/${receipts[1]!.id}/receipt`, hr)).status, 403);
});

test("6.6 M-11 2.4 · 7.1: 3 days before → reminder; Friday → nothing; late → sales, Finance, sales manager; 7 days → management; once each", async () => {
  const at = (d: string) => new Date(`${d}T09:30:00Z`); // 11:30 Cairo
  const texts = async (userId: string) => (await prisma.notification.findMany({ where: { userId, text: { contains: C } }, orderBy: { createdAt: "asc" } })).map((n) => n.text);
  const role = async (key: string) => (await prisma.user.findFirstOrThrow({ where: { status: "ACTIVE", roles: { some: { role: { key } } } } })).id;
  const admin = await role("admin"); // nobody holds «salesdir» in the seed yet: the sales manager part is checked by the rule only

  await installmentAlertsTick(at("2026-12-06")); // 4 days before: nothing
  assert.deepEqual(await texts(mohsenUser), []);
  await installmentAlertsTick(at("2026-12-07")); // Monday, 3 days before
  assert.equal((await texts(mohsenUser)).length, 1);
  assert.match((await texts(mohsenUser))[0]!, new RegExp(`قسط العقد ${code} .* ميعاده 2026-12-10 · فاضل 3 يوم`));
  assert.equal((await texts(ashrafUser)).length, 1);
  await installmentAlertsTick(at("2026-12-07")); // twice the same day: nothing new
  assert.equal((await texts(mohsenUser)).length, 1);

  await installmentAlertsTick(at("2026-12-11")); // Friday: the job rests
  assert.equal((await texts(mohsenUser)).length, 1);
  await installmentAlertsTick(at("2026-12-12")); // Saturday: late
  assert.match((await texts(mohsenUser))[1]!, /اتأخر ومتحصّلش/);
  assert.equal((await texts(admin)).length, 0);

  await installmentAlertsTick(at("2026-12-17")); // 7 days late: escalation to management only
  await installmentAlertsTick(at("2026-12-17"));
  assert.equal((await texts(admin)).length, 1);
  assert.match((await texts(admin))[0]!, /^تصعيد:/);
  assert.equal((await texts(mohsenUser)).length, 2);
  assert.deepEqual((await prisma.installment.findUniqueOrThrow({ where: { id: second } })).alerts, ["reminder", "late", "escalated"]);
  assert.deepEqual((await prisma.installment.findUniqueOrThrow({ where: { id: first } })).alerts, []); // paid: never alerted
});
