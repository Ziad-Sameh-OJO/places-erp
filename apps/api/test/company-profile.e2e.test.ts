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
const EDITOR = "ziad.medhat@places.com"; // given «marketing: view + edit» here: not the manager, so no Company Profile changes
let rahma: string, anas: string, editor: string, editorId: string, anasId: string, dealId: string, pending: string, basePdf: Buffer;
const START = new Date();
const files: string[] = [];
const versions: string[] = []; // the versions made here without this deal (cleaned up too)

before(async () => {
  editorId = (await prisma.user.findUniqueOrThrow({ where: { email: EDITOR } })).id;
  anasId = (await prisma.user.findUniqueOrThrow({ where: { email: "anas@places.com" } })).id;
  await prisma.permissionOverride.upsert({ where: { userId_module: { userId: editorId, module: "marketing" } }, create: { userId: editorId, module: "marketing", actions: ["view", "edit"] }, update: { actions: ["view", "edit"] } });
  [rahma, anas, editor] = await Promise.all(["rahma.hassan@places.com", "anas@places.com", EDITOR].map((e) => session(e)));
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
  const mine = dealId ? await prisma.companyProfileVersion.findMany({ where: { OR: [{ dealIds: { has: dealId } }, { id: { in: versions } }] }, select: { id: true, fileId: true } }) : [];
  await prisma.companyProfileVersion.deleteMany({ where: { id: { in: mine.map((v) => v.id) } } });
  await prisma.companyProfileLogo.deleteMany({ where: { dealId: { in: [dealId, pending] } } });
  await prisma.file.deleteMany({ where: { id: { in: [...files, ...mine.map((v) => v.fileId)] } } });
  await prisma.deal.deleteMany({ where: { code: { startsWith: `D-${C}` } } });
  await prisma.unit.deleteMany({ where: { code: `U-${C}` } });
  await prisma.permissionOverride.deleteMany({ where: { userId: editorId, module: "marketing" } });
  await prisma.notification.deleteMany({ where: { event: "marketing.company_profile", createdAt: { gte: START } } });
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
  // only the marketing manager changes it (client, 11 Nov): «marketing: edit» alone sees the card but can't touch it
  assert.equal((await call("/marketing/company-profile/admin", { cookie: editor })).status, 200);
  assert.equal((await call("/marketing/company-profile/file", { method: "PUT", cookie: editor, body: { fileId: "x" } })).status, 403);
  assert.equal((await call(`/marketing/company-profile/logos/${dealId}/done`, { method: "POST", cookie: editor })).status, 403);
  assert.equal((await call("/marketing/company-profile/publish", { method: "POST", cookie: editor })).status, 403);
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
  // …and are told: everyone but Rahma gets «Company Profile جديد»
  assert.ok(await prisma.notification.findFirst({ where: { userId: anasId, event: "marketing.company_profile", createdAt: { gte: START } } }));
  const rahmaId = (await prisma.user.findUniqueOrThrow({ where: { email: "rahma.hassan@places.com" } })).id;
  assert.equal(await prisma.notification.count({ where: { userId: rahmaId, event: "marketing.company_profile", createdAt: { gte: START } } }), 0);
  assert.ok((await call("/marketing/company-profile/admin", { cookie: rahma })).body.logos[dealId].published);
  assert.equal((await call("/marketing/company-profile/publish", { method: "POST", cookie: rahma })).status, 400); // nothing new
  assert.equal(await prisma.auditLog.count({ where: { entity: "CompanyProfile", entityId: v.body.id, action: "publish" } }), 1);

  // taking a logo back is a change: the next Update leaves it out
  assert.equal((await call(`/marketing/company-profile/logos/${dealId}/done`, { method: "DELETE", cookie: rahma })).status, 204);
  assert.ok((await call("/marketing/company-profile/admin", { cookie: rahma })).body.changes.removed >= 1);
});

test("L8: a deal cancelled after its logo was published is a change — the card and the Update agree, and it leaves «عملاؤنا»", async () => {
  assert.equal((await call(`/marketing/company-profile/logos/${dealId}/done`, { method: "POST", cookie: rahma })).status, 204);
  let card = (await call("/marketing/company-profile/admin", { cookie: rahma })).body;
  if (card.changes.any) { // the flow above took it back: publish it again so it's on the newest version
    const v = await call("/marketing/company-profile/publish", { method: "POST", cookie: rahma });
    assert.equal(v.status, 201, JSON.stringify(v.body));
    card = (await call("/marketing/company-profile/admin", { cookie: rahma })).body;
  }
  assert.ok(card.logos[dealId].published);
  assert.equal(card.changes.any, false);
  // versions are numbered by their place among all of them, not by the 20 shown
  assert.equal(card.versions[0].number, await prisma.companyProfileVersion.count());

  await prisma.deal.update({ where: { id: dealId }, data: { status: "CANCELLED" } });
  card = (await call("/marketing/company-profile/admin", { cookie: rahma })).body;
  assert.ok(card.changes.any && card.changes.removed >= 1, JSON.stringify(card.changes));
  // two «Update»s at once: one new version (everyone told once), the other refused
  const count = await prisma.companyProfileVersion.count();
  const both = await Promise.all([1, 2].map(() => call("/marketing/company-profile/publish", { method: "POST", cookie: rahma })));
  const codes = both.map((x) => x.status).sort();
  assert.ok(codes[0] === 201 && [400, 409].includes(codes[1]!), JSON.stringify(both.map((x) => x.body))); // 400 if the second came after the first was saved
  assert.equal(await prisma.companyProfileVersion.count(), count + 1);
  const v = both.find((x) => x.status === 201)!;
  versions.push(v.body.id);
  const row = await prisma.companyProfileVersion.findUniqueOrThrow({ where: { id: v.body.id } });
  assert.ok(!row.dealIds.includes(dealId));
  // its logo is still Done, but the card no longer counts it: nothing new, and Update says so
  assert.equal((await call("/marketing/company-profile/admin", { cookie: rahma })).body.changes.any, false);
  assert.equal((await call("/marketing/company-profile/publish", { method: "POST", cookie: rahma })).status, 400);
});
