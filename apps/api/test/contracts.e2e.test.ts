/**
 * 6.1 the contract of a Done Deal and its installment table (M-11 2.1 · 3.2 · 4.1) against the real API and database.
 * Mohamed Mohsen (sales) uploads the contract on his approved deal; Ahmed Ashraf (Finance) sees every contract; Omar
 * Gamal (sales, another team) sees none of Mohsen's; Nancy (Office Manager) only views contracts; Basant (HR) nothing.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { localDate } from "@places/domain";
import { contractRenewalTick } from "../../worker/src/processors/contract-renewal.ts";
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
  const renewals = (await prisma.contract.findMany({ where: { deal: { code: { startsWith: `D-K${stamp}` } } }, select: { renewalLeadId: true } })).map((c) => c.renewalLeadId).filter((x): x is string => !!x);
  await prisma.notification.deleteMany({ where: { text: { contains: C } } });
  await prisma.lead.deleteMany({ where: { id: { in: renewals } } });
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

test("«عقد جديد» offers the salesperson's approved deals with no contract yet", async () => {
  const form = await call("/contracts/form", { cookie: mohsen });
  assert.equal(form.status, 200);
  const mine = form.body.deals.filter((d: { code: string }) => d.code.startsWith(`D-K${stamp}`)).map((d: { id: string }) => d.id).sort();
  assert.deepEqual(mine, [approved, approved2].sort()); // not the pending one
  assert.equal((await call("/contracts/form", { cookie: nancy })).status, 403);
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
  endingId = r.body.id;
});

let endingId: string;

test("6.3 · M-11 2.4 · 7.1: 60 days left → one renewal alert to the salesperson and Finance, and a renewal lead with him; once", async () => {
  const ashrafUser = (await prisma.user.findUniqueOrThrow({ where: { email: "ahmed.ashraf@places.com" } })).id;
  const mine = (userId: string) => prisma.notification.findMany({ where: { userId, text: { contains: C } } });
  await contractRenewalTick();
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: endingId } });
  assert.deepEqual(c.renewalAlerts.sort(), [60, 90]); // the 90 passed unseen: one alert, not two
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: c.renewalLeadId! } });
  assert.equal(lead.assignedToId, mohsenEmp);
  assert.equal(lead.budget!.toFixed(2), "30000.50"); // next year's value, no increase on this one
  assert.equal(lead.stage, "FRESH");
  const [told] = await mine(mohsenUser);
  assert.match(told!.text, new RegExp(`بينتهي بعد 60 يوم .* اتعمل ليد تجديد ${lead.code}`));
  assert.equal((await mine(ashrafUser)).length, 1);

  await contractRenewalTick(); // again the same day: nothing new
  assert.equal((await mine(mohsenUser)).length, 1);
  assert.equal((await prisma.contract.findUniqueOrThrow({ where: { id: contractId } })).renewalAlerts.length, 0); // ends in a year
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

test("6.2: the tiles, the renewals card, the Aging and the calendar, in the caller's scope", async () => {
  const sum = await call("/contracts/summary", { cookie: omar });
  assert.equal(sum.status, 200);
  assert.equal(sum.body.renewals.some((r: { id: string }) => r.id === endingId), false); // not his
  const mine = (await call("/contracts/summary", { cookie: mohsen })).body;
  assert.ok(mine.renewals.some((r: { id: string; daysLeft: number }) => r.id === endingId && r.daysLeft === 60));
  assert.ok(mine.late.count >= 1); // the 20,000 due 300 days ago
  assert.ok(Number(mine.aging[3]) >= 20_000);
  assert.equal((await call("/contracts/summary", { cookie: hr })).status, 403);

  const end = (await prisma.contract.findUniqueOrThrow({ where: { id: endingId } })).endsOn.toISOString().slice(0, 10);
  const cal = await call(`/contracts/calendar?month=${end.slice(0, 7)}`, { cookie: mohsen });
  assert.equal(cal.status, 200);
  assert.ok(cal.body.byDay[end].some((x: { contractId: string; kind: string }) => x.contractId === endingId && x.kind === "end"));
  const first = await call("/contracts/calendar?month=2026-11", { cookie: mohsen });
  assert.ok(first.body.byDay["2026-11-01"].some((x: { contractId: string; amount: string }) => x.contractId === contractId && x.amount === "10000.00"));
  assert.equal((await call("/contracts/calendar?month=2026-13", { cookie: mohsen })).status, 400);
  assert.equal((await call("/contracts/form", { cookie: mohsen })).body.deals.some((d: { code: string }) => d.code.startsWith(`D-K${stamp}`)), false); // both have contracts now
});
