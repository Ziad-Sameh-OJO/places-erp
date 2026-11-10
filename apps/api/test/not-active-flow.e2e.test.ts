/**
 * 2.15 Not Active: the comparison with the inventory, the task to Marwa, her classification and Done (M-03 1.1 · 2.1
 * steps 13–16 · 2.3 · 7.1) against the real API and database. Manar is the inventory manager («approve»), Marwa the
 * specialist rows are sent to («edit»), Mohamed Mohsen is sales (no Not Active). The columns are made up.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, removeOwners, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E NA ${stamp}`;
const KNOWN = `0105${stamp.slice(-7)}`; // an owner's number already in the inventory
let manar: string, marwa: string, sales: string, marwaId: string;
let sheetId: string, knownUnit: string;
const rowOf: Record<string, string> = {};

async function upload(file: Blob, cookie: string, fields: Record<string, string>) {
  const form = new FormData();
  form.append("file", file, "cfc.csv");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${API}/not-active/import`, { method: "POST", body: form, headers: { cookie } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  [manar, marwa, sales] = await Promise.all(["manar.ahmed@places.com", "marwa.mostafa@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  marwaId = (await prisma.user.findUniqueOrThrow({ where: { email: "marwa.mostafa@places.com" } })).id;
  knownUnit = (await prisma.unit.create({ data: {
    code: `U-NA${stamp}`, type: "Rent", project: `مشروع ${stamp}`, area: "التجمع الخامس", space: 100, condition: "متشطب", ownerPhone: KNOWN,
  } })).id;
  const csv = ["رقم الوحدة,المالك,الرقم", `C-1,أ. وائل,+2${KNOWN}`, "C-2,م. دينا,01000000002", "C-3,أ. سامي,01000000003", "C-4,أ. هالة,01000000004"].join("\n");
  const r = await upload(new Blob([csv], { type: "text/csv" }), manar, { name: NAME, dedupeBy: "رقم الوحدة", numberBy: "الرقم" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  sheetId = r.body.sheetId;
  for (const row of await prisma.notActiveRow.findMany({ where: { sheetId } })) rowOf[(row.data as Record<string, string>)["رقم الوحدة"]!] = row.id;
});

after(async () => {
  const units = (await prisma.notActiveRow.findMany({ where: { sheetId }, select: { unitId: true } })).map((r) => r.unitId).filter((x): x is string => !!x);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [sheetId, ...Object.values(rowOf), ...units, knownUnit] } } });
  await prisma.notification.deleteMany({ where: { text: { contains: stamp } } });
  await prisma.notActiveSheet.deleteMany({ where: { id: sheetId } });
  const owners = (await prisma.unit.findMany({ where: { id: { in: units }, ownerId: { not: null } }, select: { ownerId: true } })).map((u) => u.ownerId!);
  await prisma.unit.deleteMany({ where: { id: { in: [...units, knownUnit] } } });
  await removeOwners(owners, new Date(Number(stamp)));
  await prisma.$disconnect();
});

const counts = (cookie: string) => call(`/not-active/sheets/${sheetId}/counts`, { cookie }).then((r) => r.body);
const classify = (cookie: string, row: string, body: object) => call(`/not-active/rows/${row}/status`, { method: "PUT", cookie, body });

test("M-03 1.1 · a number already in the inventory: marked with its unit, Alarm to Manar, the row stays in the sheet", async () => {
  const row = (await call(`/not-active/sheets/${sheetId}/rows`, { cookie: manar })).body.items.find((x: { id: string }) => x.id === rowOf["C-1"]);
  assert.deepEqual(row.matched, { id: knownUnit, code: `U-NA${stamp}` });
  assert.equal(row.matchSeen, false);
  assert.deepEqual(await counts(manar), { all: 4, "No Answer": 0, "Not True": 0, Done: 0, pending: 4, matched: 1, dupes: 0 });
  const manarUser = (await prisma.user.findUniqueOrThrow({ where: { email: "manar.ahmed@places.com" } })).id;
  assert.ok(await prisma.notification.findFirst({ where: { userId: manarUser, text: { contains: `شيت ${NAME} موجود في الانفنتوري` } } }));
  // Manar sets its status (here: Done, it's already a unit); it stays in the sheet
  const r = await classify(manar, rowOf["C-1"]!, { status: "Done" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.matchSeen, true);
  assert.equal((await counts(manar)).matched, 0);
});

test("Manar sends rows to Marwa as a task; Marwa sees only those, and is told", async () => {
  assert.ok((await call("/not-active/assignees", { cookie: manar })).body.some((p: { id: string }) => p.id === marwaId));
  const r = await call(`/not-active/sheets/${sheetId}/assign`, { method: "POST", cookie: manar, body: { rowIds: [rowOf["C-2"], rowOf["C-3"], rowOf["C-4"]], to: marwaId } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.assigned, 3);
  const mine = (await call(`/not-active/sheets/${sheetId}/rows`, { cookie: marwa })).body;
  assert.equal(mine.total, 3);
  assert.ok(mine.items.every((x: { assignedTo: { id: string } }) => x.assignedTo.id === marwaId));
  assert.ok(await prisma.notification.findFirst({ where: { userId: marwaId, text: { contains: `3 رقم من شيت ${NAME}` } } }));
  assert.equal((await call(`/not-active/sheets/${sheetId}/assign`, { method: "POST", cookie: marwa, body: { rowIds: [rowOf["C-1"]], to: marwaId } })).status, 403);
  assert.equal((await call(`/not-active/sheets/${sheetId}/assign`, { method: "POST", cookie: manar, body: { rowIds: [rowOf["C-1"]], to: "nobody" } })).status, 400);
});

test("M-03 2.3 · Marwa classifies: No Answer; Not True only with a feedback; Done isn't a status without the unit; not someone else's row", async () => {
  assert.equal((await classify(marwa, rowOf["C-2"]!, { status: "No Answer" })).status, 200);
  const noReason = await classify(marwa, rowOf["C-3"]!, { status: "Not True" });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.error, "Not True لازم يتكتب جنبه السبب (Feedback)");
  const r = await classify(marwa, rowOf["C-3"]!, { status: "Not True", feedback: "مش صاحب الوحدة" });
  assert.equal(r.status, 200);
  assert.equal(r.body.feedback, "مش صاحب الوحدة");
  assert.equal((await classify(marwa, rowOf["C-4"]!, { status: "Done" })).status, 400);
  assert.equal((await classify(marwa, rowOf["C-1"]!, { status: "No Answer" })).status, 404); // not sent to her
  assert.deepEqual(await counts(marwa), { all: 3, "No Answer": 1, "Not True": 1, Done: 0, pending: 1, matched: 0, dupes: 0 });
  const tab = (await call(`/not-active/sheets/${sheetId}/rows?tab=Not%20True`, { cookie: marwa })).body;
  assert.deepEqual(tab.items.map((x: { id: string }) => x.id), [rowOf["C-3"]]);
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: rowOf["C-3"], action: "classify" } }));
});

test("M-03 7.1 · Marwa marks Done: the unit form's fields, a draft unit, the row Done with it, Alarm to Manar; never twice", async () => {
  const opts = (await call("/not-active/unit-options", { cookie: marwa })).body;
  const unit = {
    type: "Rent", project: `برج ${stamp}`, area: opts.areas.find((a: { active: boolean }) => a.active).value, space: 140,
    condition: opts.conditions.find((c: { active: boolean }) => c.active).value, building: "B6", agentId: opts.agents[0].id,
    ownerName: "أ. هالة", ownerPhone: "01000000004", pricePerSqm: "900",
  };
  const r = await call(`/not-active/rows/${rowOf["C-4"]}/done`, { method: "POST", cookie: marwa, body: unit });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const made = await prisma.unit.findUniqueOrThrow({ where: { id: r.body.id } });
  assert.equal(made.pdfStatus, "draft"); // Manar reviews it before sales see it (Q15, 2.1 step 16)
  const row = await prisma.notActiveRow.findUniqueOrThrow({ where: { id: rowOf["C-4"] } });
  assert.deepEqual({ status: row.status, unitId: row.unitId }, { status: "Done", unitId: r.body.id });
  assert.ok(await prisma.notification.findFirst({ where: { text: { contains: `${r.body.code} من شيت ${NAME}` } } }));
  assert.equal((await call(`/not-active/rows/${rowOf["C-4"]}/done`, { method: "POST", cookie: marwa, body: unit })).status, 400);
  assert.equal((await classify(marwa, rowOf["C-4"]!, { status: "No Answer" })).status, 400);
  // a unit the API refuses leaves the row as it was
  const bad = await call(`/not-active/rows/${rowOf["C-2"]}/done`, { method: "POST", cookie: marwa, body: { ...unit, agentId: "nobody" } });
  assert.equal(bad.status, 400);
  assert.equal((await prisma.notActiveRow.findUniqueOrThrow({ where: { id: rowOf["C-2"] } })).status, "No Answer");
});

test("sales has no Not Active", async () => {
  assert.equal((await call(`/not-active/sheets/${sheetId}/rows`, { cookie: sales })).status, 403);
  assert.equal((await classify(sales, rowOf["C-2"]!, { status: "No Answer" })).status, 403);
});
