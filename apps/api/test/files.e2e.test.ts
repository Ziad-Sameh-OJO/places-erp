/**
 * 0.9 file uploads against the real API, database and MinIO (`pnpm files:local` locally, a container in CI).
 * Ahmed (Super Admin) uploads; Mohsen (sales) must not reach Ahmed's file.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

// locally the tests wait for storage to be started; in CI (where MinIO always runs) a missing store is a failure
const up = await fetch(process.env.S3_ENDPOINT ?? "http://localhost:9000").then(() => true, () => false);
const skip = !up && !process.env.CI ? "file storage isn't running (pnpm files:local or pnpm infra:up)" : false;

let admin: string, sales: string;
const ids: string[] = [];
// the smallest valid PNG: a 1×1 pixel
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

before(async () => {
  [admin, sales] = await Promise.all([session("ahmed.islam@places.com"), session("m.mohsen@places.com")]);
});
after(async () => {
  await prisma.file.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

const ask = async (body: unknown, cookie = admin) => {
  const r = await call("/files/uploads", { method: "POST", body, cookie });
  if (r.body?.id) ids.push(r.body.id);
  return r;
};

test("an image goes up with a short link, is checked, and comes back from storage", { skip }, async () => {
  const t = await ask({ name: "صورة الوحدة.png", mime: "image/png", size: PNG.length });
  assert.equal(t.status, 201);
  assert.match(t.body.url, /X-Amz-Signature=/);
  assert.equal((await call(`/files/${t.body.id}/complete`, { method: "POST", cookie: admin })).status, 409); // nothing uploaded yet

  const put = await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body: PNG });
  assert.equal(put.status, 200);
  const done = await call(`/files/${t.body.id}/complete`, { method: "POST", cookie: admin });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, "READY");

  const link = await call(`/files/${t.body.id}/url`, { cookie: admin });
  const got = await fetch(link.body.url);
  assert.equal(got.status, 200);
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), PNG);
  assert.match(got.headers.get("content-disposition") ?? "", /inline/);

  const log = await prisma.auditLog.findMany({ where: { entity: "File", entityId: t.body.id }, orderBy: { at: "asc" } });
  assert.deepEqual(log.map((l) => l.action), ["create", "update"]);
});

test("wrong type or too big is refused before any link is made", async () => {
  const exe = await ask({ name: "virus.exe", mime: "application/x-msdownload", size: 100 });
  assert.equal(exe.status, 400);
  assert.match(exe.body.issues[0].message, /نوع الملف مش مسموح/);
  const big = await ask({ name: "big.jpg", mime: "image/jpeg", size: 11 * 1024 * 1024 });
  assert.equal(big.status, 400);
  assert.match(big.body.issues[0].message, /أكبر من 10 ميجا/);
  assert.equal((await ask({ name: "contract.pdf", mime: "application/pdf", size: 15 * 1024 * 1024 })).status, 201);
});

test("the signed link only takes the declared size and type", { skip }, async () => {
  const t = await ask({ name: "a.png", mime: "image/png", size: PNG.length });
  const bigger = Buffer.concat([PNG, Buffer.alloc(10)]);
  assert.equal((await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body: bigger })).status, 403);
  assert.equal((await fetch(t.body.url, { method: "PUT", headers: { "Content-Type": "text/html" }, body: PNG })).status, 403);
});

test("someone else's file can't be completed or downloaded; signed out gets 401", { skip }, async () => {
  const t = await ask({ name: "b.png", mime: "image/png", size: PNG.length });
  await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body: PNG });
  assert.equal((await call(`/files/${t.body.id}/complete`, { method: "POST", cookie: sales })).status, 404);
  await call(`/files/${t.body.id}/complete`, { method: "POST", cookie: admin });
  assert.equal((await call(`/files/${t.body.id}/url`, { cookie: sales })).status, 404);
  assert.equal((await call("/files/uploads", { method: "POST", body: { name: "x.png", mime: "image/png", size: 10 } })).status, 401);
});
