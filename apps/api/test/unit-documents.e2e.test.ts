/**
 * 2.8 · the unit's PDF and slide (M-03 2.2 · 15 · 19) against the real API: made by the system, Manar confirms before the
 * unit reaches the sales, and any edit sends it back to her. Chromium renders them (no file storage needed).
 * 2.23 · the client's 16:9 design (P1901): the PDF = cover · building · specs · one interior a page · contacts · thank you,
 * the slide = specs + «Interior picture» two a page; each also as PowerPoint. The photo test needs file storage.
 * Manar = inventory (approve), Randa = resale (edit, no approve), Mohamed Mohsen = sales, Basant = HR (no inventory).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const up = await fetch(process.env.S3_ENDPOINT ?? "http://localhost:9000").then(() => true, () => false);
const skip = !up && !process.env.CI ? "file storage isn't running (pnpm files:local or pnpm infra:up)" : false;

const stamp = String(Date.now());
const P = `E2E ${stamp} PDF`;
let manar: string, randa: string, sales: string, hr: string, agentId: string, unitId: string, code: string, mohsenUser: string;

before(async () => {
  [manar, randa, sales, hr] = await Promise.all(["manar.ahmed@places.com", "randa.mohamed@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const mohsen = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  [agentId, mohsenUser] = [mohsen.id, mohsen.userId];
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: unitId } });
  await prisma.unit.deleteMany({ where: { project: { startsWith: P } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

/** U-101 from the demo: 95 m at 1,100 a month in Mivida. */
const body = (extra: object = {}) => ({
  type: "Rent", project: `${P} Mivida`, area: "التجمع الخامس", space: 95, condition: "متشطب", floor: "2", building: "B4", parking: 1,
  agentId, ownerName: "أ. سمير", ownerPhone: "01000000101", pricePerSqm: "1100", ...extra,
});
const doc = (cookie: string, kind: "pdf" | "slide" | "pdf/pptx" | "slide/pptx") => fetch(`${API}/inventory/units/${unitId}/${kind}`, { headers: { cookie } });
const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());
/** a PDF's pages: Chromium writes one «/Type /Page» object each */
const pages = (b: Buffer) => b.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g)?.length ?? 0;
/** a .pptx (a ZIP): its entries by name, read from the central directory and inflated */
function pptx(b: Buffer): Map<string, string> {
  const end = b.length - 22;
  assert.equal(b.readUInt32LE(end), 0x06054b50, "a ZIP");
  let at = b.readUInt32LE(end + 16);
  const out = new Map<string, string>();
  for (let i = b.readUInt16LE(end + 10); i > 0; i--) {
    const len = b.readUInt16LE(at + 28), size = b.readUInt32LE(at + 20), local = b.readUInt32LE(at + 42), name = b.toString("utf8", at + 46, at + 46 + len);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28), data = b.subarray(start, start + size);
    out.set(name, (b.readUInt16LE(at + 10) === 8 ? inflateRawSync(data) : data).toString("utf8"));
    at += 46 + len + b.readUInt16LE(at + 30) + b.readUInt16LE(at + 32);
  }
  return out;
}
const slides = (z: Map<string, string>) => [...z.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).length;
const confirm = (cookie: string) => call(`/inventory/units/${unitId}/pdf/confirm`, { method: "POST", cookie });
const salesSee = async () => (await call(`/inventory/units/${unitId}`, { cookie: sales })).status === 200;

test("a new unit's PDF and slide are made by the system; a draft is for the inventory team only", async () => {
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: body() });
  assert.equal(r.status, 201);
  ({ id: unitId, code } = r.body as { id: string; code: string });
  // no photos: cover · building · specs · one interior · contacts · thank you, 16:9, under the client's file name
  const pdf = await doc(manar, "pdf");
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  const deck = await bytes(pdf);
  assert.ok(deck.toString("latin1").startsWith("%PDF-"));
  assert.match(deck.toString("latin1"), /\/MediaBox \[0 0 960 540\]/, "16:9");
  assert.equal(pages(deck), 6);
  assert.equal(decodeURIComponent(pdf.headers.get("content-disposition") ?? ""), `inline; filename*=UTF-8''(${code}) ${P} Mivida 95M.pdf`);
  const slide = await doc(randa, "slide");
  assert.equal(slide.status, 200);
  assert.equal(pages(await bytes(slide)), 2, "specs + one «Interior picture»");
  assert.match(decodeURIComponent(slide.headers.get("content-disposition") ?? ""), new RegExp(`${code} slide\\.pdf`));
  // the PowerPoint of each: a .pptx with as many slides, «Photos coming soon» where the photos go, no commission or owner
  const pp = await doc(manar, "pdf/pptx");
  assert.equal(pp.status, 200);
  assert.equal(pp.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.match(decodeURIComponent(pp.headers.get("content-disposition") ?? ""), /^attachment; .*Mivida 95M\.pptx$/);
  const z = pptx(await bytes(pp));
  assert.equal(slides(z), 6);
  assert.match(z.get("ppt/slides/slide2.xml") ?? "", /Photos coming soon/);
  assert.match(z.get("ppt/slides/slide3.xml") ?? "", /Rent rate per meter.*EGP 1,100.*Grace period.*—/s);
  assert.doesNotMatch([...z.values()].join(""), /Commission|أ\. سمير|01000000101/);
  assert.equal(slides(pptx(await bytes(await doc(randa, "slide/pptx")))), 2);
  // Q15: not for sales before the confirm
  assert.equal((await doc(sales, "pdf")).status, 404);
  assert.equal(await salesSee(), false);
  assert.equal((await doc(sales, "pdf/pptx")).status, 404);
  assert.equal((await doc(hr, "pdf")).status, 403);
  assert.equal((await doc(hr, "slide/pptx")).status, 403);
});

test("only Manar confirms (approve): Randa and sales 403; then sales see it and are told", async () => {
  assert.equal((await confirm(randa)).status, 403);
  assert.equal((await confirm(sales)).status, 403);
  assert.equal((await confirm(manar)).status, 204);
  assert.equal((await confirm(manar)).status, 400, "confirmed once");
  assert.equal(await salesSee(), true);
  assert.equal((await doc(sales, "pdf")).status, 200);
  const told = await prisma.notification.findFirst({ where: { userId: mohsenUser, text: { contains: code } } });
  assert.match(told?.text ?? "", /اتنشرت · جاهزة للسيلز والحملات/);
  const audit = await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: unitId, action: "pdf-confirm" } });
  assert.deepEqual(audit?.after, { pdfStatus: "confirmed" });
});

test("Q19: any edit makes the PDF again and hides the unit from sales until Manar confirms again", async () => {
  const r = await call(`/inventory/units/${unitId}`, { method: "PUT", cookie: randa, body: body({ pricePerSqm: "1200" }) });
  assert.equal(r.status, 200);
  assert.equal((r.body as { pdfStatus: string }).pdfStatus, "draft");
  assert.equal(await salesSee(), false);
  assert.equal((await confirm(manar)).status, 204);
  assert.equal(await salesSee(), true);
  // saving with nothing changed doesn't
  assert.equal(((await call(`/inventory/units/${unitId}`, { method: "PUT", cookie: manar, body: body({ pricePerSqm: "1200" }) })).body as { pdfStatus: string }).pdfStatus, "confirmed");
  assert.equal((await call("/inventory/units/nope/pdf/confirm", { method: "POST", cookie: manar })).status, 404);
});

test("2.23 · a unit with 4 photos: the PDF has 8 pages (3 inside), the slide 3 (inside two a page), the same in PowerPoint", { skip }, async () => {
  // the smallest valid PNG (1×1)
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const t = await call("/files/uploads", { method: "POST", cookie: manar, body: { name: `p${i}.png`, mime: "image/png", size: PNG.length } });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    assert.equal((await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body: PNG })).status, 200);
    assert.equal((await call(`/files/${t.body.id}/complete`, { method: "POST", cookie: manar })).status, 200);
    ids.push(t.body.id);
  }
  const added = await call(`/inventory/units/${unitId}/photos`, { method: "POST", cookie: manar, body: { fileIds: ids } });
  assert.ok(added.status < 300, JSON.stringify(added.body));
  try {
    assert.equal(pages(await bytes(await doc(manar, "pdf"))), 8);
    assert.equal(pages(await bytes(await doc(manar, "slide"))), 3);
    const z = pptx(await bytes(await doc(manar, "pdf/pptx")));
    assert.equal(slides(z), 8);
    assert.doesNotMatch(z.get("ppt/slides/slide2.xml") ?? "", /Photos coming soon/);
    assert.equal(slides(pptx(await bytes(await doc(manar, "slide/pptx")))), 3);
  } finally {
    await prisma.unitPhoto.deleteMany({ where: { unitId } });
    await prisma.file.deleteMany({ where: { id: { in: ids } } });
  }
});
