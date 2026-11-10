/**
 * 2.39 · Not Active files: Manar makes a named file (the name is one of a kind, any case) in a folder, renames it and
 * moves it, uploads its sheet into it later; all audited. The files come back with their folder and who made them.
 * Marwa sees only the files with rows sent to her and can't make files; sales has no Not Active.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E FILE ${stamp}`;
let manar: string, marwa: string, sales: string, marwaId: string;

before(async () => {
  [manar, marwa, sales] = await Promise.all(["manar.ahmed@places.com", "marwa.mostafa@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  marwaId = (await prisma.user.findUniqueOrThrow({ where: { email: "marwa.mostafa@places.com" } })).id;
});

after(async () => {
  const sheets = await prisma.notActiveSheet.findMany({ where: { name: { startsWith: NAME, mode: "insensitive" } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: sheets.map((s) => s.id) } } });
  await prisma.notActiveSheet.deleteMany({ where: { id: { in: sheets.map((s) => s.id) } } });
  await prisma.$disconnect();
});

type File = { id: string; name: string; folder: string | null; createdBy: string | null; rows: number; pending: number; columns: string[] };
const files = async (cookie: string) => (await call("/not-active/sheets", { cookie })).body as File[];

async function upload(file: string, cookie: string) {
  const form = new FormData();
  form.append("file", new Blob([["رقم الوحدة,المالك,الرقم", "C-1,أ. مالك,01000000001", "C-2,م. دينا,01000000002"].join("\n")], { type: "text/csv" }), "cfc.csv");
  form.append("name", file);
  form.append("dedupeBy", "رقم الوحدة");
  const res = await fetch(`${API}/not-active/import`, { method: "POST", body: form, headers: { cookie } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("«ملف جديد»: a name and a folder, empty until its sheet; the same name again is refused; Marwa and sales can't", async () => {
  assert.equal((await call("/not-active/sheets", { method: "POST", cookie: marwa, body: { name: `${NAME} مروة` } })).status, 403);
  assert.equal((await call("/not-active/sheets", { method: "POST", cookie: sales, body: { name: `${NAME} سيلز` } })).status, 403);
  assert.equal((await call("/not-active/sheets", { method: "POST", cookie: manar, body: { name: " " } })).status, 400);

  const made = await call("/not-active/sheets", { method: "POST", cookie: manar, body: { name: NAME, folder: "CFC" } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual([made.body.name, made.body.folder, made.body.rows, made.body.columns], [NAME, "CFC", 0, []]);
  assert.ok(made.body.createdBy);
  const again = await call("/not-active/sheets", { method: "POST", cookie: manar, body: { name: NAME.toLowerCase() } });
  assert.equal(again.status, 400);
  assert.equal(again.body.error, "فيه ملف بنفس الاسم · اختار اسم تاني");
  assert.ok((await call("/not-active/folders", { cookie: manar })).body.includes("CFC"));
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: made.body.id, action: "create" } }));
});

test("rename and move to another folder (audited), the sheet goes in later, and Marwa sees the file once rows are hers", async () => {
  const f = (await files(manar)).find((x) => x.name === NAME)!;
  const other = await call("/not-active/sheets", { method: "POST", cookie: manar, body: { name: `${NAME} B` } });
  assert.equal((await call(`/not-active/sheets/${f.id}`, { method: "PUT", cookie: manar, body: { name: `${NAME} B` } })).status, 400);
  assert.equal((await call(`/not-active/sheets/${f.id}`, { method: "PUT", cookie: marwa, body: { name: `${NAME} x` } })).status, 403);
  const moved = await call(`/not-active/sheets/${f.id}`, { method: "PUT", cookie: manar, body: { name: `${NAME} نوفمبر`, folder: "CFC 2026" } });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.deepEqual([moved.body.name, moved.body.folder], [`${NAME} نوفمبر`, "CFC 2026"]);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: f.id, action: "update" } });
  assert.deepEqual(audit.before, { name: NAME, folder: "CFC" });
  // a file without a folder: an empty folder field is none
  assert.equal((await call(`/not-active/sheets/${other.body.id}`, { method: "PUT", cookie: manar, body: { name: `${NAME} B`, folder: "" } })).body.folder, null);

  const up = await upload(`${NAME} نوفمبر`, manar);
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.sheetId, f.id); // into the file, not a new one
  const filled = (await files(manar)).find((x) => x.id === f.id)!;
  assert.deepEqual([filled.rows, filled.pending, filled.columns], [2, 2, ["رقم الوحدة", "المالك", "الرقم"]]);
  assert.equal((await upload(`${NAME} نوفمبر`, marwa)).status, 403);

  assert.equal((await files(marwa)).some((x) => x.id === f.id), false); // nothing of hers in it yet
  const rows = (await call(`/not-active/sheets/${f.id}/rows`, { cookie: manar })).body.items as { id: string }[];
  assert.equal((await call(`/not-active/sheets/${f.id}/assign`, { method: "POST", cookie: manar, body: { rowIds: [rows[0]!.id], to: marwaId } })).status, 200);
  const hers = (await files(marwa)).find((x) => x.id === f.id);
  assert.equal(hers?.pending, 1);
  assert.equal((await files(marwa)).some((x) => x.id === other.body.id), false);
});
