/**
 * The inventory's operations review: Manar's PDF confirm publishes only what her screen showed (Q19), a Last update
 * typed in the form or a new location closes the owner follow-up (2.17), the Super Admin's import can't use or write
 * the owner's hidden fields (M-09, 2.36), and a Not Active sheet's number Excel stored without its 0 is still found in
 * the inventory (M-03 1.1).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { localDate } from "@places/domain";
import { API, call, session } from "./helpers.ts";

const stamp = String(Date.now());
const P = `E2E ${stamp} ops review`;
const PHONE = `010${stamp.slice(-8)}`;
const SHEET = `E2E OPS ${stamp}`;
const STARTED = new Date();
const DAY = 86_400_000;
let manar: string, admin: string, manarId: string, adminId: string, unitId: string, code: string;

const body = (extra: object = {}) => ({ type: "Rent", project: P, area: "التجمع الخامس", space: 120, condition: "متشطب", building: "B7", floor: "3", ownerName: "أ. كريم", ownerPhone: PHONE, pricePerSqm: "900", ...extra });
const detail = async () => (await call(`/inventory/units/${unitId}`, { cookie: manar })).body as { updatedAt: string; pdfStatus: string };
const followup = () => prisma.task.create({ data: { kind: "followup", unitId, byUserId: null, toUserId: manarId, dueOn: new Date(), status: "todo", note: "last update عدّى عليه أكتر من شهر · كلّم المالك" } });

before(async () => {
  [manar, admin] = await Promise.all(["manar.ahmed@places.com", "ahmed.islam@places.com"].map((e) => session(e)));
  manarId = (await prisma.user.findUniqueOrThrow({ where: { email: "manar.ahmed@places.com" } })).id;
  adminId = (await prisma.user.findUniqueOrThrow({ where: { email: "ahmed.islam@places.com" } })).id;
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: body() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ({ id: unitId, code } = r.body as { id: string; code: string });
});

after(async () => {
  const units = await prisma.unit.findMany({ where: { project: P }, select: { id: true, ownerId: true } });
  const tasks = await prisma.task.findMany({ where: { unitId: { in: units.map((u) => u.id) } }, select: { id: true } });
  const sheets = await prisma.notActiveSheet.findMany({ where: { name: SHEET }, select: { id: true } });
  const owners = units.flatMap((u) => (u.ownerId ? [u.ownerId] : []));
  await prisma.auditLog.deleteMany({ where: { OR: [
    { entityId: { in: [...units.map((u) => u.id), ...tasks.map((t) => t.id), ...sheets.map((s) => s.id), ...owners] } },
    { entity: "UnitImport", userId: adminId, at: { gte: STARTED } },
  ] } });
  await prisma.task.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } });
  await prisma.notActiveSheet.deleteMany({ where: { id: { in: sheets.map((s) => s.id) } } });
  await prisma.unit.deleteMany({ where: { id: { in: units.map((u) => u.id) } } });
  await prisma.client.deleteMany({ where: { id: { in: owners } } });
  await prisma.notification.deleteMany({ where: { createdAt: { gte: STARTED }, OR: [{ text: { contains: P } }, { text: { contains: code } }, { text: { contains: SHEET } }] } });
  await prisma.$disconnect();
});

test("Q19: the confirm publishes what Manar saw — an edit since her screen loaded is refused (409), then the current one goes", async () => {
  const seen = (await detail()).updatedAt;
  assert.equal((await call(`/inventory/units/${unitId}`, { method: "PUT", cookie: manar, body: body({ comment: "السعر اتغير" }) })).status, 200);
  const stale = await call(`/inventory/units/${unitId}/pdf/confirm`, { method: "POST", cookie: manar, body: { seen } });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.equal((await detail()).pdfStatus, "draft");
  const now = await call(`/inventory/units/${unitId}/pdf/confirm`, { method: "POST", cookie: manar, body: { seen: (await detail()).updatedAt } });
  assert.equal(now.status, 204, JSON.stringify(now.body));
  assert.equal((await detail()).pdfStatus, "confirmed");
  assert.equal((await call(`/inventory/units/${unitId}/pdf/confirm`, { method: "POST", cookie: manar, body: {} })).status, 400, "once");
});

test("2.17: a Last update typed in the form, or a new location, closes the unit's open follow-up (audited)", async () => {
  await prisma.unit.update({ where: { id: unitId }, data: { lastOwnerUpdateAt: new Date(Date.now() - 40 * DAY) } });
  const t1 = await followup();
  const r = await call(`/inventory/units/${unitId}`, { method: "PUT", cookie: manar, body: body({ comment: "السعر اتغير", lastOwnerUpdateAt: localDate(new Date()) }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: t1.id } })).status, "done");
  const audit = await prisma.auditLog.findFirst({ where: { entity: "Task", entityId: t1.id, action: "status" } });
  assert.deepEqual([audit?.userId, audit?.after], [manarId, { status: "done" }]);

  // an edit that leaves the Last update alone keeps the task open
  const t2 = await followup();
  assert.equal((await call(`/inventory/units/${unitId}`, { method: "PUT", cookie: manar, body: body({ comment: "تاني" }) })).status, 200);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: t2.id } })).status, "todo");
  assert.equal((await call(`/inventory/units/${unitId}/location`, { method: "POST", cookie: manar, body: { location: "https://maps.app.goo.gl/ops" } })).status, 200);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: t2.id } })).status, "done");
});

const head = "Type,Project,Area,المساحة,التشطيب,الدور,رقم المبنى,Parking,الاسم,الرقم,السعر للمتر,سعر الإيجار للمتر (Income),الـ Agent,الصيانة,الـ Commission,طريقة الدفع,Last update";
const importUnits = (path: string, cookie: string, fields: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([[head, `Rent,${P},التجمع الخامس,120,متشطب,3,B7,0,اسم من الشيت,${PHONE},950,,,,,,`].join("\n")], { type: "text/csv" }), "sheet.csv");
  return fetch(`${API}/imports/units${path}`, { method: "POST", body: form, headers: { cookie } });
};

test("M-09 · 2.36: the Super Admin (owner hidden) can't tell repeats by the owner's number, and «ادمج» leaves the owner's name", async () => {
  assert.equal((await importUnits("/preview", admin, { dupBy: "ownerPhone" })).status, 400);
  assert.equal((await importUnits("/preview", admin, { dupBy: "ownerName" })).status, 400);
  assert.equal((await importUnits("/preview", manar, { dupBy: "ownerPhone" })).status, 200, "Manar sees the owners");
  const r = await importUnits("", admin, { decisions: JSON.stringify({ 2: "merge" }) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).merged, 1);
  const u = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
  assert.deepEqual([u.ownerName, u.pricePerSqm?.toFixed(2)], ["أ. كريم", "950.00"]);
});

test("M-03 1.1: a number Excel kept without its 0 is still the owner's number in the inventory", async () => {
  const form = new FormData();
  form.append("file", new Blob([["المالك,الرقم", `أ. كريم,${PHONE.slice(1)}`].join("\n")], { type: "text/csv" }), "cfc.csv");
  form.append("name", SHEET);
  form.append("dedupeBy", JSON.stringify(["الرقم"]));
  form.append("numberBy", "الرقم");
  const res = await fetch(`${API}/not-active/import`, { method: "POST", body: form, headers: { cookie: manar } });
  const done = await res.json();
  assert.equal(res.status, 200, JSON.stringify(done));
  assert.equal(done.inInventory, 1);
  const row = await prisma.notActiveRow.findFirstOrThrow({ where: { sheet: { name: SHEET }, matchedUnitId: { not: null } } });
  assert.equal(row.matchedUnitId, unitId);
});
