/**
 * 2.38 · the inventory's Excel import tells a repeat by the column(s) the uploader picks: by default the unit itself
 * (Project + Area + Floor + Building Number), so one owner with two different units on the same number is NOT a repeat;
 * picking Number alone makes it one. Each repeat says what it repeats (a unit's code or an earlier line); «ضيفها برضه»
 * adds it, «ادمج» updates the unit it repeats, the rest are left out. The import is audited with the picked columns,
 * and marketing gets one Live Alert with the count. Manar (inventory) imports; sales gets 403.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, session } from "./helpers.ts";

const stamp = String(Date.now()).slice(-8);
const P = `E2E-DUP${stamp}`;
const STARTED = new Date();
let manar: string, sales: string, manarId: string;
const phone = `0100${stamp.slice(-7)}`;

before(async () => {
  [manar, sales] = await Promise.all(["manar.ahmed@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  manarId = (await prisma.user.findFirstOrThrow({ where: { email: "manar.ahmed@places.com" } })).id;
  // P1901 from the client's Rent sheet (9 Nov) is already in the inventory
  await prisma.unit.create({ data: { code: `P1901-${stamp}`, type: "Rent", project: `${P} Mivida Business Park`, area: "التجمع الخامس", space: 690, floor: "1", building: "P19", condition: "Core & Shell", ownerName: "أ. سمير", ownerPhone: phone, pricePerSqm: 900, totalPrice: 621000 } });
});

after(async () => {
  const units = await prisma.unit.findMany({ where: { project: { startsWith: P } }, select: { id: true, ownerId: true } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: units.map((u) => u.id) } }, { entity: "UnitImport", userId: manarId, createdAt: { gte: STARTED } }] } });
  await prisma.notification.deleteMany({ where: { createdAt: { gte: STARTED }, text: { contains: "من استيراد Excel" } } });
  await prisma.unit.deleteMany({ where: { id: { in: units.map((u) => u.id) } } });
  const owners = units.flatMap((u) => (u.ownerId ? [u.ownerId] : []));
  const empty = await prisma.client.findMany({ where: { id: { in: owners }, units: { none: {} }, leads: { none: {} } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: empty.map((c) => c.id) } } });
  await prisma.client.deleteMany({ where: { id: { in: empty.map((c) => c.id) } } });
  await prisma.$disconnect();
});

const head = "Type,Project,Area,المساحة,التشطيب,الدور,رقم المبنى,Parking,الاسم,الرقم,السعر للمتر,سعر الإيجار للمتر (Income),الـ Agent,الصيانة,الـ Commission,طريقة الدفع,Last update";
const row = (space: number, floor: string, price: string) => `Rent,${P} Mivida Business Park,التجمع الخامس,${space},Core & Shell,${floor},P19,0,أ. سمير,${phone},${price},,,,,,`;
// line 2 = P1901 itself (new price) · line 3 = the same owner's other unit · line 4 = line 3 again
const csv = [head, row(690, "1", "950"), row(320, "2", "800"), row(320, "2", "800")].join("\n");

const upload = (path: string, cookie: string, fields: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([csv], { type: "text/csv" }), "sheet.csv");
  return fetch(`${API}/imports/units${path}`, { method: "POST", body: form, headers: { cookie } });
};
type Review = { line: number; dupOf: { unit: string } | { line: number } | null };

test("the default columns: the same owner's other unit is new; Number alone makes it a repeat; sales 403", async () => {
  assert.equal((await upload("/preview", sales)).status, 403);
  const p = await (await upload("/preview", manar)).json();
  assert.deepEqual(p.dupBy, ["project", "space", "floor", "building"]);
  assert.deepEqual(p.review.map((r: Review) => r.dupOf), [{ unit: `P1901-${stamp}` }, null, { line: 3 }]);
  assert.deepEqual([p.valid, p.duplicates], [1, 2]);

  const byNumber = await (await upload("/preview", manar, { dupBy: "ownerPhone" })).json();
  assert.deepEqual(byNumber.review.map((r: Review) => r.dupOf), [{ unit: `P1901-${stamp}` }, { unit: `P1901-${stamp}` }, { unit: `P1901-${stamp}` }]);
  assert.equal((await upload("/preview", manar, { dupBy: "" })).status, 400);
  assert.equal((await upload("/preview", manar, { dupBy: "price" })).status, 400);
});

test("«ضيفها برضه» adds a repeat, «ادمج» updates the unit, the rest are left out; audited with the columns; one Live Alert", async () => {
  assert.equal((await upload("", sales, { decisions: JSON.stringify({ 4: "add" }) })).status, 403);
  const r = await upload("", manar, { dupBy: "project,space,floor,building", decisions: JSON.stringify({ 2: "merge", 4: "add" }) });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { imported: 2, duplicates: 2, skipped: 0, merged: 1 });

  const units = await prisma.unit.findMany({ where: { project: { startsWith: P } }, orderBy: [{ space: "asc" }, { code: "asc" }] });
  assert.deepEqual(units.map((u) => [u.space, u.pricePerSqm?.toFixed(2)]), [[320, "800.00"], [320, "800.00"], [690, "950.00"]]);
  assert.equal(units[2]!.totalPrice?.toFixed(2), "655500.00"); // 690 × 950, merged into P1901
  assert.equal(units[2]!.pdfStatus, "draft");

  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "UnitImport", userId: manarId, createdAt: { gte: STARTED } } });
  assert.deepEqual((audit.after as { dupBy: string[] }).dupBy, ["project", "space", "floor", "building"]);
  const alert = await prisma.notification.findMany({ where: { event: "unit.new", createdAt: { gte: STARTED }, text: { contains: "من استيراد Excel" } } });
  assert.ok(alert.length > 0 && alert.every((n) => n.text.includes("2 وحدة جديدة")), "marketing gets the count");
});
