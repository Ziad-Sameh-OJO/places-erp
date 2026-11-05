/**
 * 2.8 · the unit's PDF and slide (M-03 2.2 · 15 · 19) against the real API: made by the system, Manar confirms before the
 * unit reaches the sales, and any edit sends it back to her. Chromium renders them (no file storage needed).
 * Manar = inventory (approve), Randa = resale (edit, no approve), Mohamed Mohsen = sales, Basant = HR (no inventory).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

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
const doc = (cookie: string, kind: "pdf" | "slide") => fetch(`${API}/inventory/units/${unitId}/${kind}`, { headers: { cookie } });
const confirm = (cookie: string) => call(`/inventory/units/${unitId}/pdf/confirm`, { method: "POST", cookie });
const salesSee = async () => (await call(`/inventory/units/${unitId}`, { cookie: sales })).status === 200;

test("a new unit's PDF and slide are made by the system; a draft is for the inventory team only", async () => {
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: body() });
  assert.equal(r.status, 201);
  ({ id: unitId, code } = r.body as { id: string; code: string });
  const pdf = await doc(manar, "pdf");
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  const a4 = Buffer.from(await pdf.arrayBuffer()).toString("latin1");
  assert.ok(a4.startsWith("%PDF-"));
  assert.match(a4, /\/MediaBox \[0 0 59[45]\.\d+ 84[12]\.\d+\]/, "A4");
  assert.match(a4, /IBMPlexSansArabic/);
  const slide = await doc(randa, "slide");
  assert.equal(slide.status, 200);
  assert.match(Buffer.from(await slide.arrayBuffer()).toString("latin1"), /\/MediaBox \[0 0 960 540\]/, "16:9, one page");
  assert.match(decodeURIComponent(slide.headers.get("content-disposition") ?? ""), new RegExp(`${code} slide\\.pdf`));
  // Q15: not for sales before the confirm
  assert.equal((await doc(sales, "pdf")).status, 404);
  assert.equal(await salesSee(), false);
  assert.equal((await doc(hr, "pdf")).status, 403);
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
