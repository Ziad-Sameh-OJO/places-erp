/**
 * 6.1 the contract of a Done Deal and its installment table (M-11 2.1 · 3.2 · 4.1) against the real API and database.
 * Mohamed Mohsen (sales) uploads the contract on his approved deal; Ahmed Ashraf (Finance) sees every contract; Omar
 * Gamal (sales, another team) sees none of Mohsen's; Nancy (Office Manager) only views contracts; Basant (HR) nothing.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { localDate } from "@places/domain";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const C = `E2E ${stamp} عقد`;
let mohsen: string, ashraf: string, omar: string, nancy: string, hr: string;
let mohsenEmp: string, mohsenUser: string;
let approved: string, approved2: string, pending: string, pdf: string, pdf2: string, image: string;

before(async () => {
  [mohsen, ashraf, omar, nancy, hr] = await Promise.all(["m.mohsen", "ahmed.ashraf", "omar.gamal", "nancy.islam", "basant.elsawy"].map((e) => session(`${e}@places.com`)));
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  mohsenEmp = emp.id; mohsenUser = emp.userId;
  const lead = await prisma.lead.create({ data: { code: `L-K${stamp}`, name: C, phones: [`0104${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook", createdById: "e2e", assignedToId: mohsenEmp } });
  const deal = async (n: number, status: string) => {
    const unit = await prisma.unit.create({ data: { code: `U-K${stamp}${n}`, type: "Rent", project: `${C} ${n}`, area: "التجمع الخامس", space: 300, condition: "Finished", pdfStatus: "confirmed" } });
    return (await prisma.deal.create({ data: {
      code: `D-K${stamp}${n}`, leadId: lead.id, unitId: unit.id, type: "Rent", space: 300, location: `${C} ${n}`, company: `${C} شركة ${n}`, source: "Facebook",
      status: status as never, commissionOwner: "50000", commissionClient: "0", closedAt: new Date(), createdById: "e2e",
      participants: { create: [{ employeeId: mohsenEmp, side: "BUYER" }] },
    } })).id;
  };
  approved = await deal(1, "APPROVED");
  approved2 = await deal(2, "PARTIALLY_COLLECTED");
  pending = await deal(3, "PENDING_REVIEW");
  const file = (n: string, mime: string) => prisma.file.create({ data: { key: `e2e/${stamp}-${n}`, name: `${C} ${n}`, mime, size: 100, status: "READY", uploadedById: mohsenUser } });
  [pdf, pdf2, image] = (await Promise.all([file("1.pdf", "application/pdf"), file("2.pdf", "application/pdf"), file("logo.png", "image/png")])).map((f) => f.id);
});

after(async () => {
  await prisma.contract.deleteMany({ where: { deal: { code: { startsWith: `D-K${stamp}` } } } });
  await prisma.deal.deleteMany({ where: { code: { startsWith: `D-K${stamp}` } } });
  await prisma.file.deleteMany({ where: { name: { startsWith: C } } });
  await prisma.lead.deleteMany({ where: { code: `L-K${stamp}` } });
  await prisma.unit.deleteMany({ where: { code: { startsWith: `U-K${stamp}` } } });
  await prisma.$disconnect();
});

const create = (cookie: string, body: object) => call("/contracts", { method: "POST", cookie, body });
const body = (over: object = {}) => ({ dealId: approved, startsOn: "2026-11-01", endsOn: "2027-10-31", value: "120000", escalation: 10, fileId: pdf, schedule: { count: 12, everyMonths: 1 }, ...over });

test("permissions: HR sees no contracts; the Office Manager views but doesn't upload", async () => {
  assert.equal((await call("/contracts", { cookie: hr })).status, 403);
  assert.equal((await create(nancy, body())).status, 403);
});

test("refusals: a deal not approved yet, a file that isn't a PDF, dates the wrong way, a table that doesn't add up", async () => {
  assert.equal((await create(mohsen, body({ dealId: pending }))).status, 404);
  assert.equal((await create(omar, body())).status, 404); // not his deal
  assert.equal((await create(mohsen, body({ fileId: image }))).status, 400);
  assert.equal((await create(mohsen, body({ endsOn: "2026-10-01" }))).status, 400);
  const r = await create(mohsen, body({ schedule: { lines: [{ dueOn: "2026-11-01", amount: "100000" }] } }));
  assert.equal(r.status, 400);
  assert.match(JSON.stringify(r.body), /مجموع الأقساط لازم يساوي قيمة العقد/);
});

let contractId: string;

test("M-11 3.2: 120,000 over 12 months → 12 × 10,000 from the start; next year at +10% = 132,000; one contract per deal", async () => {
  const r = await create(mohsen, body());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  contractId = r.body.id;
  assert.match(r.body.code, /^C-\d+$/);
  assert.equal(r.body.status, "Active");
  assert.equal(r.body.client, `${C} شركة 1`);
  assert.equal(r.body.installments.length, 12);
  assert.deepEqual([...new Set(r.body.installments.map((i: { amount: string }) => i.amount))], ["10000.00"]);
  assert.deepEqual([r.body.installments[0].dueOn, r.body.installments[11].dueOn], ["2026-11-01", "2027-10-01"]);
  assert.equal(r.body.nextYearValue, "132000.00");
  assert.equal(r.body.file.name, `${C} 1.pdf`);
  assert.equal(r.body.installments[0].state, localDate(new Date()) > "2026-11-01" ? "late" : "due");
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "contracts", entityId: contractId, action: "create" } }));
  assert.equal((await create(mohsen, body({ fileId: pdf2 }))).status, 409);
});

test("a table written line by line, and «قرّبت تخلص» for an active contract with 90 days or less left", async () => {
  const today = localDate(new Date());
  const plus = (d: number) => new Date(Date.parse(`${today}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
  const r = await create(mohsen, body({ dealId: approved2, fileId: pdf2, startsOn: plus(-300), endsOn: plus(60), value: "30000.50", escalation: 0,
    schedule: { lines: [{ dueOn: plus(-300), amount: "20000" }, { dueOn: plus(30), amount: "10000.50" }] } }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.endingSoon, true);
  assert.equal(r.body.daysLeft, 60);
  assert.deepEqual(r.body.installments.map((i: { amount: string; state: string }) => [i.amount, i.state]), [["20000.00", "late"], ["10000.50", "due"]]);
  const ending = await call(`/contracts?ending=true&q=${encodeURIComponent(C)}`, { cookie: ashraf });
  assert.deepEqual(ending.body.items.map((c: { id: string }) => c.id), [r.body.id]);
});

test("scope (M-11 4.1): the salesperson his clients' contracts, Finance all, another salesperson none", async () => {
  const q = `?q=${encodeURIComponent(C)}`;
  assert.equal((await call(`/contracts${q}`, { cookie: mohsen })).body.total, 2);
  assert.equal((await call(`/contracts${q}`, { cookie: ashraf })).body.total, 2);
  assert.equal((await call(`/contracts${q}`, { cookie: omar })).body.total, 0);
  assert.equal((await call(`/contracts/${contractId}`, { cookie: omar })).status, 404);
  const url = await call(`/contracts/${contractId}/file`, { cookie: ashraf });
  assert.equal(url.status, 200);
  assert.match(url.body.url, /^https?:\/\//);
});
