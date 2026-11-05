/**
 * 2.12 Unit recommendations on a lead (M-03 3.2 · 7.1) against the real API and database: the client's 100 m,
 * finished, 120,000 a month; the 5000 m divisible unit; the narrowing answers saved on the lead; the ± tolerance as
 * the admin's setting (proposed ±20%, needs-client). Mohamed Mohsen is the lead's salesperson; Mohamed Eid another
 * salesperson (his own leads only); Basant is HR (no leads); Ahmed Islam the admin.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
// a finishing only this test's units have, so other units in the database never match the lead
const finish = `E2E تشطيب ${stamp}`;
let mohsen: string, eid: string, hr: string, admin: string;
let leadId: string;
let toleranceBefore: unknown;

before(async () => {
  [mohsen, eid, hr, admin] = await Promise.all(["m.mohsen@places.com", "m.eid@places.com", "basant.elsawy@places.com", "ahmed.islam@places.com"].map((e) => session(e)));
  toleranceBefore = (await prisma.setting.findUnique({ where: { key: "recommendTolerancePct" } }))?.value;
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  leadId = (await prisma.lead.create({ data: {
    code: `L-R${stamp}`, name: `E2E ${stamp} ترشيح`, phones: [`0102${stamp.slice(-7)}1`], area: "التجمع الخامس", type: "Rent", space: 100,
    condition: finish, budget: "120000", channel: "Facebook", assignedToId: emp.id, assignedAt: new Date(), createdById: "e2e",
  } })).id;
  const unit = (n: string, o: Record<string, unknown>) => prisma.unit.create({ data: {
    code: `U-R${stamp}-${n}`, type: "Rent", project: `مشروع ${stamp}`, area: "التجمع الخامس", space: 100, condition: finish,
    pricePerSqm: "1000", pdfStatus: "confirmed", ...o,
  } });
  await unit("100", { pricePerSqm: "1100" }); // 110,000 a month
  await unit("80", { space: 80, pricePerSqm: "1500", area: "المعادي" }); // 80 = 100 − 20%: 120,000
  await unit("G2", { space: 110, floor: "G", parking: 2 }); // 110,000
  await unit("121", { space: 121 }); // too big
  await unit("dear", { space: 110, pricePerSqm: "1310" }); // 144,100 > 120,000 + 20%
  await unit("draft", { pdfStatus: "draft" }); // Manar hasn't confirmed it: not for sales (Q15)
  await unit("resale", { type: "Resale", pricePerSqm: "30000" });
  await unit("5000", { space: 5_000, divisible: true, minSplit: 100 }); // M-03 7.1
});

after(async () => {
  await (toleranceBefore === undefined
    ? prisma.setting.deleteMany({ where: { key: "recommendTolerancePct" } })
    : prisma.setting.update({ where: { key: "recommendTolerancePct" }, data: { value: toleranceBefore as number } }));
  await prisma.auditLog.deleteMany({ where: { entityId: leadId } });
  await prisma.lead.deleteMany({ where: { code: `L-R${stamp}` } });
  await prisma.unit.deleteMany({ where: { code: { startsWith: `U-R${stamp}` } } });
  await prisma.$disconnect();
});

const recs = (cookie: string) => call(`/leads/${leadId}/recommendations`, { cookie });
const codes = (body: { items: { code: string }[] }) => body.items.map((u) => u.code.replace(`U-R${stamp}-`, "")).sort();
const answer = (cookie: string, body: object) => call(`/leads/${leadId}/answers`, { method: "PUT", cookie, body });

test("M-03 7.1 · 100 m finished, 120,000: near 100 m, the same finishing, within the budget, and the divisible 5000 m", async () => {
  const r = await recs(mohsen);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.tolerancePct, 20);
  assert.deepEqual(codes(r.body), ["100", "5000", "80", "G2"]);
  const big = r.body.items.find((u: { code: string }) => u.code.endsWith("-5000"));
  assert.equal(big.split, true);
  assert.equal(big.price, "100000.00"); // priced on the client's 100 m (Q20)
  assert.equal(big.monthly, true); // Rent: a month's rent
  assert.equal(r.body.client.budget, "120000.00");
  assert.deepEqual(r.body.projects, [`مشروع ${stamp}`]);
  // the same area ranks first
  assert.equal(r.body.items.at(-1).code, `U-R${stamp}-80`);
  assert.equal(r.body.items[0].sameArea, true);
});

test("only who may see the lead: HR has no leads (403), another salesperson doesn't have this one (404)", async () => {
  assert.equal((await recs(hr)).status, 403);
  assert.equal((await recs(eid)).status, 404);
  assert.equal((await answer(hr, { floor: "ground" })).status, 403);
  assert.equal((await answer(eid, { floor: "ground" })).status, 404);
});

test("M-03 7.1 · ground floor + parking 2: only those stay, and the answers are kept on the lead and audited", async () => {
  const r = await answer(mohsen, { floor: "ground", parking: 2, project: "" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(codes(r.body), ["G2"]);
  assert.deepEqual(r.body.answers, { floor: "ground", parking: 2 });
  assert.deepEqual((await recs(mohsen)).body.answers, { floor: "ground", parking: 2 });
  assert.deepEqual((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).answers, { floor: "ground", parking: 2 });
  const audit = await prisma.auditLog.findFirst({ where: { entityId: leadId, action: "answers" }, orderBy: { at: "desc" } });
  assert.deepEqual(audit?.after, { floor: "ground", parking: 2 });
  // «مش عايز مساحة متقسمة» drops the 5000 m part
  assert.deepEqual(codes((await answer(mohsen, { split: "no" })).body), ["100", "80", "G2"]);
  assert.equal((await answer(mohsen, { parking: 0 })).status, 400);
  assert.equal((await answer(mohsen, { floor: "3" })).status, 400);
  assert.equal((await answer(mohsen, { colour: "blue" })).status, 400);
  assert.deepEqual(codes((await answer(mohsen, {})).body), ["100", "5000", "80", "G2"]);
});

test("the ± tolerance is the admin's setting (proposed 20%): at 10% the 80 m unit is no longer near 100 m", async () => {
  assert.equal((await call("/settings/recommendTolerancePct", { method: "PUT", cookie: mohsen, body: { value: 10 } })).status, 403);
  assert.equal((await call("/settings/recommendTolerancePct", { method: "PUT", cookie: admin, body: { value: 101 } })).status, 400);
  assert.equal((await call("/settings/recommendTolerancePct", { method: "PUT", cookie: admin, body: { value: 10 } })).status, 200);
  try {
    const r = await recs(mohsen);
    assert.equal(r.body.tolerancePct, 10);
    assert.deepEqual(codes(r.body), ["100", "5000", "G2"]);
  } finally {
    await call("/settings/recommendTolerancePct", { method: "PUT", cookie: admin, body: { value: 20 } });
  }
});
