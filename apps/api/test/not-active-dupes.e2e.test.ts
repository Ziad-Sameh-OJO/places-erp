/**
 * 2.40 · Not Active: the repeat is told by one or more columns (all must match). By default every row goes in and the
 * repeats are marked (red on screen, filterable); «متدخلش» leaves the repeats out and lets the first of each in. The
 * preview counts both before anything is saved; the file's columns can be changed later (count first, audited).
 * Manar uploads and changes; Marwa can't; sales has no Not Active.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E DUP ${stamp}`;
let manar: string, marwa: string, sales: string;

before(async () => {
  [manar, marwa, sales] = await Promise.all(["manar.ahmed@places.com", "marwa.mostafa@places.com", "m.mohsen@places.com"].map((e) => session(e)));
});
after(async () => {
  const sheets = await prisma.notActiveSheet.findMany({ where: { name: { startsWith: NAME } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: sheets.map((s) => s.id) } } });
  await prisma.notActiveSheet.deleteMany({ where: { id: { in: sheets.map((s) => s.id) } } });
  await prisma.$disconnect();
});

// أ. سمير has two numbers (two rows that are NOT repeats); م. دينا's number is written twice (a repeat)
const sheet = new Blob([[
  "رقم الوحدة,المالك,الرقم",
  "C-1,أ. سمير,01012345678",
  "C-2,أ. سمير,01198765432",
  "C-3,م. دينا,01000000101",
  "C-4,م. دينا,+20 100 000 0101",
  "C-5,أ. وائل,01055501210",
].join("\n")], { type: "text/csv" });

async function upload(path: string, cookie: string, fields: Record<string, string>) {
  const form = new FormData();
  form.append("file", sheet, "cfc.csv");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${API}/not-active/${path}`, { method: "POST", body: form, headers: { cookie } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const sheetId = async (name: string) => (await prisma.notActiveSheet.findFirstOrThrow({ where: { name } })).id;
const rows = async (id: string, q = "") => (await call(`/not-active/sheets/${id}/rows?pageSize=50${q}`, { cookie: manar })).body as { total: number; items: { data: Record<string, string>; dupes: number }[] };

test("the preview: by the number (the default) one repeat; by the owner's name alone the two numbers of one owner repeat too", async () => {
  const byNumber = await upload("preview", manar, { name: NAME });
  assert.equal(byNumber.status, 200, JSON.stringify(byNumber.body));
  assert.deepEqual(byNumber.body.dedupeBy, ["الرقم"]);
  assert.deepEqual([byNumber.body.marked, byNumber.body.duplicates, byNumber.body.added], [2, 1, 5]);
  const byName = await upload("preview", manar, { name: NAME, dedupeBy: JSON.stringify(["المالك"]) });
  assert.deepEqual([byName.body.marked, byName.body.duplicates], [4, 2]);
  // the owner with two numbers is never a repeat when the number is picked too
  const both = await upload("preview", manar, { name: NAME, dedupeBy: JSON.stringify(["المالك", "الرقم"]), skipDupes: "true" });
  assert.deepEqual([both.body.marked, both.body.duplicates, both.body.added], [2, 1, 4]);
  assert.equal((await upload("preview", marwa, { name: NAME })).status, 403);
});

test("«تدخل ومتعلّمة» (the default): every row goes in, the repeats are marked and filtered", async () => {
  const r = await upload("import", manar, { name: NAME, dedupeBy: JSON.stringify(["الرقم"]) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.added, r.body.marked, r.body.skipped], [5, 2, 0]);
  const id = await sheetId(NAME);
  assert.deepEqual((await rows(id)).items.map((x) => x.dupes), [0, 0, 1, 1, 0]);
  assert.deepEqual((await rows(id, "&dup=any")).items.map((x) => x.data["رقم الوحدة"]), ["C-3", "C-4"]);
  assert.equal((await rows(id, "&dup=none")).total, 3);
  assert.equal((await call(`/not-active/sheets/${id}/counts`, { cookie: manar })).body.dupes, 2);
});

test("«متدخلش» leaves the repeats out only (the first of each goes in)", async () => {
  const r = await upload("import", manar, { name: `${NAME} skip`, dedupeBy: "الرقم", skipDupes: "true" });
  assert.deepEqual([r.body.added, r.body.skipped], [4, 1]);
  const kept = (await rows(await sheetId(`${NAME} skip`))).items.map((x) => x.data["رقم الوحدة"]);
  assert.deepEqual(kept, ["C-1", "C-2", "C-3", "C-5"]);
});

test("«غيّر خانة منع التكرار»: the count before saving, then saved and audited; Marwa can't, sales has no Not Active", async () => {
  const id = await sheetId(NAME);
  const q = `?columns=${encodeURIComponent(JSON.stringify(["المالك"]))}`;
  assert.deepEqual((await call(`/not-active/sheets/${id}/dedupe${q}`, { cookie: manar })).body, { marked: 4 });
  assert.equal((await call(`/not-active/sheets/${id}/dedupe${q}`, { cookie: sales })).status, 403);
  assert.equal((await call(`/not-active/sheets/${id}/dedupe`, { method: "PUT", cookie: marwa, body: { columns: ["المالك"] } })).status, 403);
  assert.equal((await call(`/not-active/sheets/${id}/dedupe`, { method: "PUT", cookie: manar, body: { columns: ["مش موجودة"] } })).status, 400);
  assert.equal((await call(`/not-active/sheets/${id}/dedupe`, { method: "PUT", cookie: manar, body: { columns: [] } })).status, 400);
  const saved = await call(`/not-active/sheets/${id}/dedupe`, { method: "PUT", cookie: manar, body: { columns: ["المالك"] } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.dedupeBy, ["المالك"]);
  assert.equal((await rows(id, "&dup=any")).total, 4);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "dedupe" } });
  assert.deepEqual([audit.before, audit.after], [{ dedupeBy: ["الرقم"] }, { dedupeBy: ["المالك"] }]);
});
