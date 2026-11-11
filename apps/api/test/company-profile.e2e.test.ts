/**
 * M-04 · Q26 · the Company Profile end-to-end: marketing uploads its PDF and a logo on a Done Deal, presses Done,
 * previews the file + «عملاؤنا» page, presses Update; everyone signed in gets the newest version; who may do what.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const stamp = Date.now().toString(36);
const C = `CP${stamp}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let rahma: string, anas: string, dealId: string, pending: string, basePdf: Buffer;
const files: string[] = [];

before(async () => {
  [rahma, anas] = await Promise.all(["rahma.hassan@places.com", "anas@places.com"].map((e) => session(e)));
  const unitId = (await prisma.unit.create({ data: { code: `U-${C}`, type: "Rent", project: C, space: 150, pdfStatus: "confirmed" } })).id;
  const deal = (k: string, status: string) => prisma.deal.create({ data: {
    code: `D-${C}${k}`, unitId, type: "Rent", status: status as never, space: 150, location: "التجمع الخامس", company: `${C} شركة ${k}`, source: "Facebook",
    commissionOwner: 0, commissionClient: 0, closedAt: new Date(), createdById: "e2e",
  } }).then((d) => d.id);
  [dealId, pending] = await Promise.all([deal("1", "APPROVED"), deal("2", "PENDING_REVIEW")]);
  const doc = await PDFDocument.create();
  doc.addPage([842, 595]); doc.addPage([842, 595]); // a landscape brochure of two pages
  basePdf = Buffer.from(await doc.save());
});

after(async () => {
  // the versions this file made, then everything they point at (older versions from other runs stay)
  const mine = dealId ? await prisma.companyProfileVersion.findMany({ where: { dealIds: { has: dealId } }, select: { id: true, fileId: true } }) : [];
  await prisma.companyProfileVersion.deleteMany({ where: { id: { in: mine.map((v) => v.id) } } });
  await prisma.companyProfileLogo.deleteMany({ where: { dealId: { in: [dealId, pending] } } });
  await prisma.file.deleteMany({ where: { id: { in: [...files, ...mine.map((v) => v.fileId)] } } });
  await prisma.deal.deleteMany({ where: { code: { startsWith: `D-${C}` } } });
  await prisma.unit.deleteMany({ where: { code: `U-${C}` } });
  await prisma.$disconnect();
});

/** Through core/files, as the browser does: ask, PUT, complete. */
async function upload(cookie: string, name: string, mime: string, body: Buffer, purpose?: string) {
  const t = await call("/files/uploads", { method: "POST", cookie, body: { name, mime, size: body.length, purpose } });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  files.push(t.body.id);
  assert.equal((await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body })).status, 200);
  assert.equal((await call(`/files/${t.body.id}/complete`, { method: "POST", cookie })).status, 200);
  return t.body.id as string;
}
const pages = async (cookie: string) => {
  const r = await fetch(`${API}/marketing/company-profile/preview`, { headers: { cookie } });
  assert.equal(r.status, 200, await r.clone().text());
  return (await PDFDocument.load(await r.arrayBuffer())).getPageCount();
};

test("who may: sales get the newest version but can't see the card, upload, or Update", async () => {
  assert.equal((await call("/marketing/company-profile", { cookie: anas })).status, 200);
  assert.equal((await call("/marketing/company-profile/admin", { cookie: anas })).status, 403);
  assert.equal((await call("/marketing/company-profile/file", { method: "PUT", cookie: anas, body: { fileId: "x" } })).status, 403);
  assert.equal((await call(`/marketing/company-profile/logos/${dealId}`, { method: "PUT", cookie: anas, body: { fileId: "x" } })).status, 403);
  assert.equal((await call("/marketing/company-profile/publish", { method: "POST", cookie: anas })).status, 403);
  assert.equal((await call("/marketing/company-profile", {})).status, 401);
});

test("a brochure past 20 MB only with purpose «profile»; the file must be a PDF and the logo an image", async () => {
  const big = { name: "profile.pdf", mime: "application/pdf", size: 40 * 1024 * 1024 };
  assert.equal((await call("/files/uploads", { method: "POST", cookie: rahma, body: big })).status, 400);
  const ok = await call("/files/uploads", { method: "POST", cookie: rahma, body: { ...big, purpose: "profile" } });
  assert.equal(ok.status, 201);
  files.push(ok.body.id);
  const png = await upload(rahma, "logo.png", "image/png", PNG);
  assert.equal((await call("/marketing/company-profile/file", { method: "PUT", cookie: rahma, body: { fileId: png } })).status, 400);
  const pdf = await upload(rahma, "x.pdf", "application/pdf", basePdf);
  assert.equal((await call(`/marketing/company-profile/logos/${dealId}`, { method: "PUT", cookie: rahma, body: { fileId: pdf } })).status, 400);
  assert.equal((await call(`/marketing/company-profile/logos/${pending}`, { method: "PUT", cookie: rahma, body: { fileId: png } })).status, 404); // not approved yet
});

test("the flow: file → logo → Done → preview has «عملاؤنا» → Update → everyone gets it; nothing new = no Update", async () => {
  const base = await upload(rahma, `${C}.pdf`, "application/pdf", basePdf, "profile");
  assert.equal((await call("/marketing/company-profile/file", { method: "PUT", cookie: rahma, body: { fileId: base } })).status, 204);
  const logo = await upload(rahma, "logo.png", "image/png", PNG);
  assert.equal((await call(`/marketing/company-profile/logos/${dealId}`, { method: "PUT", cookie: rahma, body: { fileId: logo } })).status, 204);

  let card = (await call("/marketing/company-profile/admin", { cookie: rahma })).body;
  assert.equal(card.base.id, base);
  assert.deepEqual([card.logos[dealId].done, card.logos[dealId].published], [false, false]);
  const without = await pages(rahma); // not Done: «عملاؤنا» doesn't have it (other Done logos may)

  assert.equal((await call(`/marketing/company-profile/logos/${dealId}/done`, { method: "POST", cookie: rahma })).status, 204);
  card = (await call("/marketing/company-profile/admin", { cookie: rahma })).body;
  assert.equal(card.logos[dealId].done, true);
  assert.ok(card.changes.any && card.changes.added >= 1);
  const withLogo = await pages(rahma);
  assert.ok(withLogo >= 3 && withLogo >= without, `${without} → ${withLogo}`); // the two pages + «عملاؤنا»

  const v = await call("/marketing/company-profile/publish", { method: "POST", cookie: rahma });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  assert.ok(v.body.logos >= 1);
  const latest = (await call("/marketing/company-profile", { cookie: anas })).body.latest;
  assert.equal(latest.id, v.body.id); // sales get the newest
  assert.ok((await call("/marketing/company-profile/admin", { cookie: rahma })).body.logos[dealId].published);
  assert.equal((await call("/marketing/company-profile/publish", { method: "POST", cookie: rahma })).status, 400); // nothing new
  assert.equal(await prisma.auditLog.count({ where: { entity: "CompanyProfile", entityId: v.body.id, action: "publish" } }), 1);

  // taking a logo back is a change: the next Update leaves it out
  assert.equal((await call(`/marketing/company-profile/logos/${dealId}/done`, { method: "DELETE", cookie: rahma })).status, 204);
  assert.ok((await call("/marketing/company-profile/admin", { cookie: rahma })).body.changes.removed >= 1);
});
