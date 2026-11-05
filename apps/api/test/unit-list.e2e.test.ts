/**
 * 2.13 The client's unit list (M-01 6.1 · M-03 6.1) against the real API and database: the PDF of the picked units,
 * and a comment on the lead with each unit's project and space. Mohamed Mohsen is the lead's salesperson; Mohamed
 * Eid another salesperson (his own leads only); Basant is HR (no leads).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const stamp = String(Date.now());
let mohsen: string, eid: string, hr: string;
let leadId: string;
const units: Record<string, string> = {};

before(async () => {
  [mohsen, eid, hr] = await Promise.all(["m.mohsen@places.com", "m.eid@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  leadId = (await prisma.lead.create({ data: {
    code: `L-UL${stamp}`, name: `E2E ${stamp} لستة`, phones: [`0103${stamp.slice(-7)}1`], area: "التجمع الخامس", type: "Rent", space: 100,
    channel: "Facebook", assignedToId: emp.id, assignedAt: new Date(), createdById: "e2e",
  } })).id;
  const unit = async (n: string, o: Record<string, unknown>) => {
    units[n] = (await prisma.unit.create({ data: {
      code: `U-UL${stamp}-${n}`, type: "Rent", project: `مشروع ${stamp}`, area: "التجمع الخامس", space: 100, condition: "متشطب",
      pricePerSqm: "1000", totalPrice: "100000", pdfStatus: "confirmed", ...o,
    } })).id;
  };
  await unit("a", {});
  await unit("b", { space: 120, project: `برج ${stamp}`, totalPrice: "120000" });
  await unit("draft", { pdfStatus: "draft" });
  await unit("rented", { status: "rented" });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: leadId }, { after: { path: ["leadId"], equals: leadId } }] } });
  await prisma.lead.deleteMany({ where: { code: `L-UL${stamp}` } });
  await prisma.unit.deleteMany({ where: { code: { startsWith: `U-UL${stamp}` } } });
  await prisma.$disconnect();
});

/** The endpoint answers a PDF, so it's read raw (helpers.call reads JSON). */
async function sendList(cookie: string, unitIds: string[]) {
  const res = await fetch(`${API}/leads/${leadId}/unit-list`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ unitIds }) });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get("content-type"), disposition: res.headers.get("content-disposition"), buf };
}

test("M-01 6.1 · M-03 6.1: the picked units come back as one PDF, and the lead gets the comment with each project and space", async () => {
  const r = await sendList(mohsen, [units.b!, units.a!]);
  assert.equal(r.status, 200, r.buf.toString());
  assert.equal(r.type, "application/pdf");
  assert.ok(r.buf.toString("latin1").startsWith("%PDF-"));
  assert.match(decodeURIComponent(r.disposition ?? ""), /List of options · E2E/);
  const lead = (await call(`/leads/${leadId}`, { cookie: mohsen })).body;
  const comment = lead.activities.find((a: { kind: string; text: string }) => a.kind === "comment" && a.text.includes(stamp));
  assert.equal(comment.text, `تم إرسال الوحدات التالية للعميل (PDF): U-UL${stamp}-b (برج ${stamp} · 120 م)، U-UL${stamp}-a (مشروع ${stamp} · 100 م)`);
  assert.equal(comment.by.name, "محمد محسن");
  // the units are kept as the lead's suggested units, and it's in the audit log
  assert.deepEqual((await prisma.leadUnit.findMany({ where: { leadId } })).map((u) => u.unitId).sort(), [units.a!, units.b!].sort());
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "unit-list", after: { path: ["leadId"], equals: leadId } } }));
  // sending a unit again keeps one suggestion row
  assert.equal((await sendList(mohsen, [units.a!])).status, 200);
  assert.equal(await prisma.leadUnit.count({ where: { leadId } }), 2);
});

test("Q20 · a big divisible unit suggested in part goes on the list with the client's space", async () => {
  await prisma.unit.create({ data: {
    code: `U-UL${stamp}-big`, type: "Rent", project: `مول ${stamp}`, area: "التجمع الخامس", space: 5_000, condition: "متشطب",
    pricePerSqm: "1000", totalPrice: "5000000", pdfStatus: "confirmed", divisible: true, minSplit: 100,
  } }).then((u) => (units.big = u.id));
  assert.equal((await sendList(mohsen, [units.big!])).status, 200);
  const lead = (await call(`/leads/${leadId}`, { cookie: mohsen })).body;
  assert.ok(lead.activities.some((a: { text: string }) => a.text === `تم إرسال الوحدات التالية للعميل (PDF): U-UL${stamp}-big (مول ${stamp} · 100 م من 5000 م)`));
});

test("only open units Manar confirmed, at least one: a draft or a rented unit is refused and nothing is recorded", async () => {
  const before = await prisma.leadActivity.count({ where: { leadId } });
  assert.equal((await sendList(mohsen, [units.a!, units.draft!])).status, 400);
  assert.equal((await sendList(mohsen, [units.rented!])).status, 400);
  assert.equal((await sendList(mohsen, [])).status, 400);
  assert.equal(await prisma.leadActivity.count({ where: { leadId } }), before);
});

test("who may send: HR has no leads (403), another salesperson doesn't have this one (404)", async () => {
  assert.equal((await sendList(hr, [units.a!])).status, 403);
  assert.equal((await sendList(eid, [units.a!])).status, 404);
});
