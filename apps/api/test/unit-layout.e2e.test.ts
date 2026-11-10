/**
 * 2.35 · a unit's «Layout file» folder (PDF · DWG · images) instead of Layout Yes / No, with the client's own files for
 * P1901 (docs/requirements/sources/client-files/2026-11-09): Sara (inventory team) uploads the PDF and the DWG, the
 * sheet's Layout follows the folder, the PDF opens and the DWG downloads, a file is replaced and removed (both in the
 * audit), and sales see and download but never upload. A DWG goes nowhere but a Layout folder.
 * Manar = inventory, Sara = inventory_staff, Mohamed Mohsen = sales, Basant = HR (no inventory).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const up = await fetch(process.env.S3_ENDPOINT ?? "http://localhost:9000").then(() => true, () => false);
const skip = !up && !process.env.CI ? "file storage isn't running (pnpm files:local or pnpm infra:up)" : false;

const dir = fileURLToPath(new URL("../../../docs/requirements/sources/client-files/2026-11-09/", import.meta.url));
const PDF = readFileSync(`${dir}Layout P1901 - 25-00-04-03.pdf`);
const DWG = readFileSync(`${dir}Layout P1901 - 2D-CAD-MALLE.dwg`);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const stamp = String(Date.now());
let manar: string, sara: string, sales: string, hr: string, unitId: string;
const files: string[] = [];

before(async () => {
  [manar, sara, sales, hr] = await Promise.all(["manar.ahmed@places.com", "sara.abdelhalim@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  unitId = (await prisma.unit.create({ data: { code: `P1901-${stamp}`, type: "Rent", project: `E2E ${stamp} Layout`, area: "التجمع الخامس", space: 690, condition: "Core & Shell", pdfStatus: "confirmed" } })).id;
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: unitId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.file.deleteMany({ where: { id: { in: files } } });
  await prisma.$disconnect();
});

const ask = (cookie: string, name: string, mime: string, size: number, folder?: "layout") =>
  call("/files/uploads", { method: "POST", cookie, body: { name, mime, size, ...(folder ? { folder } : {}) } });
/** Through core/files, as the browser does: ask, PUT, complete. */
async function upload(cookie: string, name: string, mime: string, body: Buffer) {
  const t = await ask(cookie, name, mime, body.length, "layout");
  assert.equal(t.status, 201, JSON.stringify(t.body));
  files.push(t.body.id);
  assert.equal((await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body })).status, 200);
  const done = await call(`/files/${t.body.id}/complete`, { method: "POST", cookie });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return t.body.id as string;
}
const base = () => `/inventory/units/${unitId}/layout`;
const list = (cookie: string) => call(base(), { cookie });
const unit = async (cookie: string) => ((await call(`/inventory/units?q=${encodeURIComponent(`E2E ${stamp} Layout`)}`, { cookie })).body.items as Array<{ id: string; layout: boolean; layoutCount: number }>).find((u) => u.id === unitId)!;

test("who may: sales see the folder but don't upload, replace or remove; HR has no inventory", async () => {
  assert.equal((await list(manar)).status, 200);
  assert.deepEqual((await list(sales)).body, []);
  assert.equal((await list(hr)).status, 403);
  assert.equal((await call(base(), { method: "POST", cookie: sales, body: { fileIds: ["x"] } })).status, 403);
  assert.equal((await call(`${base()}/x`, { method: "PUT", cookie: sales, body: { fileId: "y" } })).status, 403);
  assert.equal((await call(`${base()}/x`, { method: "DELETE", cookie: sales })).status, 403);
  assert.equal((await call(base(), { method: "POST", cookie: manar, body: { fileIds: [] } })).status, 400);
});

test("a DWG / DXF is for the Layout folder only, up to 50 MB", async () => {
  assert.equal((await ask(sara, "plan.dwg", "image/vnd.dwg", 1000)).status, 400);
  assert.equal((await ask(sara, "plan.dwg", "image/vnd.dwg", 51 * 1024 * 1024, "layout")).status, 400);
});

test("P1901: the PDF and the DWG go up, Layout follows the folder, the PDF opens and the DWG downloads; replace and remove are audited", { skip }, async () => {
  assert.equal((await unit(manar)).layout, false);
  const pdf = await upload(sara, "Layout P1901 - 25-00-04-03.pdf", "application/pdf", PDF);
  const dwg = await upload(sara, "Layout P1901 - 2D-CAD-MALLE.dwg", "image/vnd.dwg", DWG);
  const added = await call(base(), { method: "POST", cookie: sara, body: { fileIds: [pdf, dwg] } });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  assert.deepEqual(added.body.map((f: { name: string; kind: string }) => `${f.name}:${f.kind}`), ["Layout P1901 - 25-00-04-03.pdf:pdf", "Layout P1901 - 2D-CAD-MALLE.dwg:drawing"]);
  assert.deepEqual(await unit(sales).then((u) => [u.layout, u.layoutCount]), [true, 2]);

  // sales open the PDF in the browser and download the DWG with its name
  const seen = (await list(sales)).body as Array<{ kind: string; url: string; download: string }>;
  const open = await fetch(seen[0]!.url);
  assert.match(open.headers.get("content-disposition") ?? "", /^inline/);
  assert.equal(Buffer.from(await open.arrayBuffer()).length, PDF.length);
  const save = await fetch(seen[1]!.download);
  assert.match(save.headers.get("content-disposition") ?? "", /^attachment.*2D-CAD-MALLE\.dwg/);
  assert.equal(Buffer.from(await save.arrayBuffer()).length, DWG.length);
  const zip = await fetch(`${API}${base()}/zip`, { headers: { cookie: sales } });
  assert.equal(zip.status, 200);
  assert.match(decodeURIComponent(zip.headers.get("content-disposition") ?? ""), /- Layout\.zip/);

  // the PDF and slide never read the Layout folder
  assert.equal(await prisma.unitPhoto.count({ where: { unitId } }), 0);

  // «استبدال»: an image takes the PDF's place (first), both names in the audit
  const img = await upload(manar, "Layout P1901.png", "image/png", PNG);
  const rep = await call(`${base()}/${pdf}`, { method: "PUT", cookie: manar, body: { fileId: img } });
  assert.equal(rep.status, 200, JSON.stringify(rep.body));
  assert.deepEqual(rep.body.map((f: { name: string }) => f.name), ["Layout P1901.png", "Layout P1901 - 2D-CAD-MALLE.dwg"]);
  const replaced = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Unit", entityId: unitId, action: "layout-replace" } });
  assert.match(JSON.stringify([replaced.before, replaced.after]), /25-00-04-03\.pdf.*Layout P1901\.png/);

  // removing the last files leaves the unit without a Layout
  for (const id of [img, dwg]) assert.equal((await call(`${base()}/${id}`, { method: "DELETE", cookie: manar })).status, 204);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Unit", entityId: unitId, action: "layout-remove" } }), 2);
  assert.equal((await unit(manar)).layout, false);
  assert.equal((await call(`${base()}/${img}`, { method: "DELETE", cookie: manar })).status, 404);
});
