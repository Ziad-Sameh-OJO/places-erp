/**
 * 2.4 · a unit's photos (M-03 1.2 · 3.1 «pic or info») against the real API, database and file storage: Manar and Randa
 * add, order and remove; whoever sees the unit sees them; the first is the main photo (the card). The upload tests need
 * storage (pnpm files:local locally; always in CI) — the permission ones don't.
 * Manar = inventory, Randa = resale, Mohamed Mohsen = sales, Basant = HR (no inventory).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const up = await fetch(process.env.S3_ENDPOINT ?? "http://localhost:9000").then(() => true, () => false);
const skip = !up && !process.env.CI ? "file storage isn't running (pnpm files:local or pnpm infra:up)" : false;

const stamp = String(Date.now());
let manar: string, randa: string, sales: string, hr: string, unitId: string;
const files: string[] = [];
// the smallest valid PNG (1×1) and a PDF header
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n%\n");

before(async () => {
  [manar, randa, sales, hr] = await Promise.all(["manar.ahmed@places.com", "randa.mohamed@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  unitId = (await prisma.unit.create({ data: {
    code: `U-P${stamp}`, type: "Rent", project: `E2E ${stamp} صور`, area: "التجمع الخامس", space: 95, condition: "متشطب", agentId, pdfStatus: "confirmed",
  } })).id;
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: unitId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.file.deleteMany({ where: { id: { in: files } } });
  await prisma.$disconnect();
});

/** Through core/files, as the browser does: ask, PUT, complete. */
async function upload(cookie: string, name: string, mime: string, body: Buffer) {
  const t = await call("/files/uploads", { method: "POST", cookie, body: { name, mime, size: body.length } });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  files.push(t.body.id);
  assert.equal((await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body })).status, 200);
  assert.equal((await call(`/files/${t.body.id}/complete`, { method: "POST", cookie })).status, 200);
  return t.body.id as string;
}
const photos = (cookie: string) => call(`/inventory/units/${unitId}/photos`, { cookie });
const add = (cookie: string, fileIds: string[]) => call(`/inventory/units/${unitId}/photos`, { method: "POST", cookie, body: { fileIds } });
const order = (cookie: string, fileIds: string[]) => call(`/inventory/units/${unitId}/photos/order`, { method: "PUT", cookie, body: { fileIds } });
const names = (r: { body: unknown }) => (r.body as Array<{ name: string; main: boolean }>).map((p) => `${p.name}${p.main ? "*" : ""}`);

test("who may: sales and marketing see, only the editors add / order / remove, HR has no inventory", async () => {
  assert.equal((await photos(manar)).status, 200);
  assert.deepEqual((await photos(sales)).body, []);
  assert.equal((await photos(hr)).status, 403);
  assert.equal((await add(sales, ["x"])).status, 403);
  assert.equal((await order(sales, [])).status, 403);
  assert.equal((await call(`/inventory/units/${unitId}/photos/x`, { method: "DELETE", cookie: sales })).status, 403);
  // a file that isn't a finished upload of yours
  assert.equal((await add(manar, ["nope"])).status, 400);
  assert.equal((await add(manar, [])).status, 400);
  assert.equal((await call("/inventory/units/nope/photos", { cookie: manar })).status, 404);
});

test("Manar adds three photos: in order, the first is the main one, sales see them and the card shows it", { skip }, async () => {
  const ids = [await upload(manar, "واجهة.png", "image/png", PNG), await upload(manar, "ريسبشن.png", "image/png", PNG), await upload(manar, "مكتب.png", "image/png", PNG)];
  const r = await add(manar, ids);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(names(r), ["واجهة.png*", "ريسبشن.png", "مكتب.png"]);
  const seen = await photos(sales);
  assert.deepEqual(names(seen), ["واجهة.png*", "ريسبشن.png", "مكتب.png"]);
  const got = await fetch((seen.body as Array<{ url: string }>)[0]!.url);
  assert.equal(got.status, 200);
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), PNG);
  const row = ((await call(`/inventory/units?q=${encodeURIComponent(`E2E ${stamp}`)}`, { cookie: sales })).body as { items: Array<{ photo: string | null; photoCount: number }> }).items[0]!;
  assert.match(row.photo ?? "", /X-Amz-Signature=/);
  assert.equal(row.photoCount, 3);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: unitId, action: "photos-add" } }));
  // the same file can't be added twice, nor someone else's upload, nor a PDF
  assert.equal((await add(manar, [ids[0]!])).status, 400);
  assert.equal((await add(randa, [await upload(manar, "تاني.png", "image/png", PNG)])).status, 400);
  assert.equal((await add(manar, [await upload(manar, "عقد.pdf", "application/pdf", PDF)])).status, 400);
});

test("ordering: the new first is the main one; a stale order is refused; Randa removes one and the rest move up", { skip }, async () => {
  const ids = ((await photos(manar)).body as Array<{ id: string }>).map((p) => p.id);
  const r = await order(randa, [ids[2]!, ids[0]!, ids[1]!]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(names(r), ["مكتب.png*", "واجهة.png", "ريسبشن.png"]);
  assert.equal((await order(manar, [ids[0]!, ids[1]!])).status, 400, "one left out");
  assert.equal((await call(`/inventory/units/${unitId}/photos/${ids[2]}`, { method: "DELETE", cookie: randa })).status, 204);
  assert.deepEqual(names(await photos(manar)), ["واجهة.png*", "ريسبشن.png"]);
  assert.equal((await call(`/inventory/units/${unitId}/photos/${ids[2]}`, { method: "DELETE", cookie: manar })).status, 404);
  const audit = await prisma.auditLog.findMany({ where: { entity: "Unit", entityId: unitId, action: { in: ["photos-order", "photos-remove"] } } });
  assert.equal(audit.length, 2);
});
