/**
 * 2.14 Not Active sheets (M-03 1.1 · 2.3 · 7.1) against the real API and database: Manar uploads a sheet, a second
 * sheet of the same name adds only the rows whose value in the column she picks is new, re-uploading the same file adds
 * nothing. Marwa (Inventory Specialist) sees the sheets but can't upload; Mohamed Mohsen (sales) has no Not Active.
 * The columns are made up: the client hasn't sent the CFC sheet's yet.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E CFC ${stamp}`;
let manar: string, marwa: string, sales: string;

before(async () => {
  [manar, marwa, sales] = await Promise.all(["manar.ahmed@places.com", "marwa.mostafa@places.com", "m.mohsen@places.com"].map((e) => session(e)));
});

after(async () => {
  const sheets = await prisma.notActiveSheet.findMany({ where: { name: { startsWith: `E2E CFC ${stamp}`, mode: "insensitive" } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: sheets.map((s) => s.id) } } });
  await prisma.notActiveSheet.deleteMany({ where: { id: { in: sheets.map((s) => s.id) } } });
  await prisma.$disconnect();
});

/** A CSV the way people export it: a header row, then rows (unit numbers C-…, owners' numbers). */
const csv = (units: number[], extra = "") =>
  new Blob([[`رقم الوحدة,المالك,الرقم${extra ? ",ملاحظات" : ""}`, ...units.map((n) => `C-${n},أ. مالك ${n},0100${String(n).padStart(7, "0")}${extra ? `,${extra}` : ""}`)].join("\n")], { type: "text/csv" });

async function upload(path: string, file: Blob, cookie: string, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file, "cfc.csv");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${API}/not-active/${path}`, { method: "POST", body: form, headers: { cookie } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

test("Manar uploads a CFC sheet: its own columns, every row, audited", async () => {
  const p = await upload("preview", csv(range(100, 40)), manar, { name: NAME, dedupeBy: "رقم الوحدة" });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.deepEqual(p.body.headers, ["رقم الوحدة", "المالك", "الرقم"]);
  assert.equal(p.body.total, 40);
  assert.equal(p.body.sheet, null);
  assert.equal(p.body.added, 40);
  assert.equal(await prisma.notActiveSheet.count({ where: { name: NAME } }), 0); // the preview saves nothing

  const r = await upload("import", csv(range(100, 40)), manar, { name: NAME, dedupeBy: "رقم الوحدة" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual({ added: r.body.added, duplicates: r.body.duplicates }, { added: 40, duplicates: 0 });
  const sheets = (await call("/not-active/sheets", { cookie: manar })).body;
  const sheet = sheets.find((s: { name: string }) => s.name === NAME);
  assert.deepEqual({ rows: sheet.rows, dedupeBy: sheet.dedupeBy, columns: sheet.columns }, { rows: 40, dedupeBy: ["رقم الوحدة"], columns: ["رقم الوحدة", "المالك", "الرقم"] });
  const rows = (await call(`/not-active/sheets/${sheet.id}/rows`, { cookie: manar })).body;
  assert.equal(rows.total, 40);
  assert.deepEqual(rows.items[0].data, { "رقم الوحدة": "C-100", "المالك": "أ. مالك 100", "الرقم": "01000000100" });
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: sheet.id, action: "create", module: "notactive" } }));
});

test("M-03 7.1 · a second CFC sheet of 50 rows, 20 already there: «متدخلش» adds only the 30 new ones; the same file again adds nothing", async () => {
  // C-120…C-139 are in the sheet, C-200…C-229 aren't; the new file has a new column too, and «cfc» is the same sheet
  const second = csv([...range(120, 20), ...range(200, 30)], "مكتب");
  const p = await upload("preview", second, manar, { name: NAME.toLowerCase(), dedupeBy: "رقم الوحدة", skipDupes: "true" });
  assert.equal(p.body.sheet?.name, NAME);
  assert.deepEqual({ added: p.body.added, duplicates: p.body.duplicates }, { added: 30, duplicates: 20 });
  const r = await upload("import", second, manar, { name: NAME.toLowerCase(), dedupeBy: "رقم الوحدة", skipDupes: "true" });
  assert.deepEqual({ added: r.body.added, duplicates: r.body.duplicates }, { added: 30, duplicates: 20 });
  const sheet = await prisma.notActiveSheet.findFirstOrThrow({ where: { name: NAME }, include: { _count: { select: { rows: true } } } });
  assert.equal(sheet._count.rows, 70);
  assert.deepEqual(sheet.columns, ["رقم الوحدة", "المالك", "الرقم", "ملاحظات"]);
  assert.equal(await prisma.notActiveSheet.count({ where: { name: { equals: NAME, mode: "insensitive" } } }), 1);
  // the same file again: nothing new
  const again = await upload("import", second, manar, { name: NAME, dedupeBy: "رقم الوحدة", skipDupes: "true" });
  assert.deepEqual({ added: again.body.added, duplicates: again.body.duplicates }, { added: 0, duplicates: 50 });
  // by the owner's number instead (Manar picks the column): written differently, still the same number
  const byNumber = new Blob([["رقم الوحدة,الرقم", "C-900,+20 100 000 0100", "C-901,01099999999"].join("\n")], { type: "text/csv" });
  const n = await upload("import", byNumber, manar, { name: NAME, dedupeBy: "الرقم", skipDupes: "true" });
  assert.deepEqual({ added: n.body.added, duplicates: n.body.duplicates }, { added: 1, duplicates: 1 });
  assert.deepEqual((await prisma.notActiveSheet.findFirstOrThrow({ where: { name: NAME } })).dedupeBy, ["الرقم"]);
});

test("the column must be in the file, the name is required, and a sheet without rows is refused", async () => {
  assert.equal((await upload("import", csv([1]), manar, { name: `${NAME} 2`, dedupeBy: "رقم الشقة" })).status, 400);
  assert.equal((await upload("import", csv([1]), manar, { dedupeBy: "رقم الوحدة" })).status, 400);
  assert.equal((await upload("import", csv([]), manar, { name: `${NAME} 2`, dedupeBy: "رقم الوحدة" })).status, 400);
  assert.equal((await upload("import", new Blob(["not a sheet"]), manar, { name: `${NAME} 2`, dedupeBy: "x" })).status, 400);
});

test("who: Marwa sees the sheets but can't upload; sales has no Not Active", async () => {
  assert.equal((await call("/not-active/sheets", { cookie: marwa })).status, 200);
  assert.equal((await upload("import", csv([1]), marwa, { name: NAME, dedupeBy: "رقم الوحدة" })).status, 403);
  assert.equal((await upload("preview", csv([1]), marwa)).status, 403);
  assert.equal((await call("/not-active/sheets", { cookie: sales })).status, 403);
});
