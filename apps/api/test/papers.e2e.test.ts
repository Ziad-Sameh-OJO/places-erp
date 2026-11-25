/**
 * «المستندات» (client, 25 Nov) against the real API, database and file storage: the Office Manager uploads a Word
 * file as it is, names its blanks and marks the ellipsis that isn't one; only sales see it; a salesperson fills it,
 * it waits for the Office Manager's approval, then he downloads the filled file; «بلّغ بس» issues it at once and tells
 * the people listed. Nobody else may set templates up.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { prisma } from "@places/db";
import type { PaperRow, TemplateCard, TemplateView } from "@places/contracts";
import { call, mark, session } from "./helpers.ts";

const S3 = process.env.S3_ENDPOINT ?? "http://localhost:9000";
const up = await fetch(S3, { method: "HEAD" }).then(() => true, () => false);
const skip = !up && !process.env.CI ? "file storage isn't running (pnpm files:local or pnpm infra:up)" : false;

const stamp = String(Date.now());
const NAME = `E2E مطالبة ${stamp}`;
mark(NAME);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
let office: string, sales: string, hr: string, officeUser: string, salesUser: string, templateId: string;
const docIds: string[] = [];

// a Word file as Word writes it: the blank split over runs, an ellipsis that is only punctuation, a {{name}}
const run = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
const p = (...r: string[]) => `<w:p>${r.join("")}</w:p>`;
async function wordFile(): Promise<Buffer> {
  const z = new JSZip();
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  z.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`
    + p(run("مطالبة مالية")) + p(run("السادة / ……"), run("……")) + p(run("تحية طيبة و بعد ...")) + p(run("المبلغ ( "), run("……"), run(" ) جنيه")) + p(run("العميل: {{اسم العميل}}"))
    + `</w:body></w:document>`);
  return z.generateAsync({ type: "nodebuffer" });
}
async function upload(cookie: string, body: Buffer, purpose?: string) {
  const t = await call("/files/uploads", { method: "POST", cookie, body: { name: `${NAME}.docx`, mime: DOCX, size: body.length, ...(purpose ? { purpose } : {}) } });
  if (t.status !== 201) return t;
  await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body });
  return call(`/files/${t.body.id}/complete`, { method: "POST", cookie });
}
const filled = async (id: string, cookie: string) => {
  const r = await call(`/papers/${id}/file`, { cookie });
  if (r.status !== 200) return r.status;
  const zip = await JSZip.loadAsync(await (await fetch(r.body.url)).arrayBuffer());
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((m) => [...m[1]!.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => x[1]).join(""));
};

before(async () => {
  [office, sales, hr] = await Promise.all(["nancy.islam@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const user = (email: string) => prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } }).then((u) => u.id);
  [officeUser, salesUser] = await Promise.all([user("nancy.islam@places.com"), user("m.mohsen@places.com")]);
});
after(async () => {
  const templates = await prisma.wordTemplate.findMany({ where: { name: { startsWith: NAME } }, select: { id: true, fileId: true } });
  const docs = await prisma.wordDocument.findMany({ where: { templateId: { in: templates.map((t) => t.id) } }, select: { id: true, fileId: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...templates.map((t) => t.id), ...docs.map((d) => d.id)] } } });
  await prisma.notification.deleteMany({ where: { text: { contains: NAME } } });
  await prisma.wordDocument.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  await prisma.wordTemplate.deleteMany({ where: { id: { in: templates.map((t) => t.id) } } });
  await prisma.file.deleteMany({ where: { OR: [{ name: { startsWith: NAME } }, { id: { in: [...templates.map((t) => t.fileId), ...docs.flatMap((d) => (d.fileId ? [d.fileId] : []))] } }] } });
  await prisma.$disconnect();
});

test("a Word file goes up only for a template, and only the Super Admin / Office Manager set templates up", { skip }, async () => {
  const body = await wordFile();
  assert.equal((await upload(office, body)).status, 400); // no purpose: a Word file is a template's only
  const f = await upload(sales, body, "template");
  assert.equal(f.status, 200);
  assert.equal((await call("/papers/templates", { method: "POST", cookie: sales, body: { name: NAME, fileId: f.body.id } })).status, 403);
  assert.equal((await call("/papers/templates/manage", { cookie: sales })).status, 403);
});

test("the Office Manager uploads it as it is: the blanks are found and named by the words before them", { skip }, async () => {
  const f = await upload(office, await wordFile(), "template");
  const r = await call("/papers/templates", { method: "POST", cookie: office, body: { name: NAME, fileId: f.body.id } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const v = r.body as TemplateView;
  templateId = v.id;
  assert.deepEqual(v.fields.map((x) => [x.id, x.label, x.named]), [[1, "السادة", false], [2, "تحية طيبة و بعد", false], [3, "المبلغ", false], [4, "اسم العميل", true]]);
  assert.deepEqual(v.marks, { stamp: false, signature: false });
  // off until its setup is saved: nobody can issue «خانة 3» with no approval meanwhile
  assert.equal(v.active, false);
  assert.equal(((await call("/papers/templates", { cookie: sales })).body as TemplateCard[]).some((c) => c.id === templateId), false);
  assert.equal((await call("/papers", { method: "POST", cookie: sales, body: { templateId, values: { 1: "x" } } })).status, 404);
});

test("setup: names, «مش خانة», sales only, needs the Office Manager's approval; refused without an approver", { skip }, async () => {
  const body = {
    name: NAME, fields: [{ id: 1, label: "اسم الشركة", skip: false }, { id: 2, label: "x", skip: true }, { id: 3, label: "قيمة العمولة", skip: false }, { id: 4, label: "اسم العميل", skip: false }],
    seeRoles: ["sales"], seeUserIds: [], mode: "approve", approverIds: [officeUser, salesUser], notifyIds: [], stamp: false, active: true,
  };
  assert.equal((await call(`/papers/templates/${templateId}`, { method: "PUT", cookie: office, body: { ...body, approverIds: [] } })).status, 400);
  assert.equal((await call(`/papers/templates/${templateId}`, { method: "PUT", cookie: office, body: { ...body, fields: [{ id: 99, label: "x", skip: false }] } })).status, 400);
  const r = await call(`/papers/templates/${templateId}`, { method: "PUT", cookie: office, body });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const card = ((await call("/papers/templates", { cookie: sales })).body as TemplateCard[]).find((c) => c.id === templateId);
  assert.deepEqual(card?.fields.map((f) => f.label), ["اسم الشركة", "قيمة العمولة", "اسم العميل"]); // the skipped one isn't asked
  assert.equal(((await call("/papers/templates", { cookie: hr })).body as TemplateCard[]).some((c) => c.id === templateId), false); // HR isn't sales
});

test("«لازم موافقة»: waits for the Office Manager; he can't download it until approved; a rejection needs its reason", { skip }, async () => {
  const r = await call("/papers", { method: "POST", cookie: sales, body: { templateId, values: { 1: "شركة المثال", 3: "50,000", 4: "عميل & شركاه", 2: "ignored" } } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const d = r.body as PaperRow;
  docIds.push(d.id);
  assert.equal(d.status, "pending");
  assert.equal(d.canDownload, false);
  assert.match(d.code, /^DOC-\d+$/);
  assert.equal(await filled(d.id, sales), 404);
  assert.equal(await filled(d.id, hr), 404);
  const waiting = (await call("/papers/approvals", { cookie: office })).body as PaperRow[];
  assert.ok(waiting.some((x) => x.id === d.id && x.status === "pending"));
  assert.ok(await prisma.notification.findFirst({ where: { userId: officeUser, event: "paper.request", text: { contains: d.code } } }));
  // the approver reads it before deciding: every blank filled, the skipped ellipsis untouched
  const text = await filled(d.id, office) as string[];
  assert.deepEqual(text.slice(1), ["السادة / شركة المثال", "تحية طيبة و بعد ...", "المبلغ ( 50,000 ) جنيه", "العميل: عميل &amp; شركاه"]);
  // he is an approver of the template too, but never of what he asked for himself — and he isn't asked
  assert.equal((await call(`/papers/${d.id}/decide`, { method: "POST", cookie: sales, body: { approve: true } })).status, 403);
  assert.equal(await prisma.notification.count({ where: { userId: salesUser, event: "paper.request", text: { contains: d.code } } }), 0);
  assert.equal((await call(`/papers/${d.id}/decide`, { method: "POST", cookie: office, body: { approve: false } })).status, 400); // no reason
  const ok = await call(`/papers/${d.id}/decide`, { method: "POST", cookie: office, body: { approve: true } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await call(`/papers/${d.id}/decide`, { method: "POST", cookie: office, body: { approve: true } })).status, 400); // decided already
  assert.ok(Array.isArray(await filled(d.id, sales))); // his now
  const mine = (await call("/papers/mine", { cookie: sales })).body as PaperRow[];
  assert.equal(mine.find((x) => x.id === d.id)?.status, "approved");
  assert.ok(await prisma.notification.findFirst({ where: { userId: salesUser, event: "paper.decided", text: { contains: d.code } } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: d.id, action: "approve", userId: officeUser } }));
});

test("two decisions at once: only one lands, the other is told it was decided; a pasted Word line break still makes a valid file", { skip }, async () => {
  const r = await call("/papers", { method: "POST", cookie: sales, body: { templateId, values: { 1: "شركة\u000Bالمثال\u0001", 3: "1\t000" } } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const d = r.body as PaperRow;
  docIds.push(d.id);
  const text = await filled(d.id, office) as string[]; // JSZip read it; the XML is well-formed (no raw \v)
  assert.equal(text[1], "السادة / شركة المثال");
  assert.equal(text[3], "المبلغ ( 1 000 ) جنيه");
  const decide = (approve: boolean) => call(`/papers/${d.id}/decide`, { method: "POST", cookie: office, body: approve ? { approve } : { approve, note: "مش مظبوط" } });
  const [a, b] = await Promise.all([decide(true), decide(false)]);
  assert.deepEqual([a.status, b.status].filter((s) => s === 200), [200], `${a.status} ${b.status}`);
  assert.ok([a.status, b.status].every((s) => [200, 400, 409].includes(s)));
  assert.equal(await prisma.auditLog.count({ where: { entityId: d.id, action: { in: ["approve", "reject"] } } }), 1);
  const won = (a.status === 200 ? a : b).body as PaperRow;
  assert.equal((await prisma.wordDocument.findUniqueOrThrow({ where: { id: d.id } })).status, won.status);
});

test("«بلّغ بس»: ready at once and the people listed are told; a deleted template is gone from the list", { skip }, async () => {
  const v = ((await call("/papers/templates/manage", { cookie: office })).body as TemplateView[]).find((x) => x.id === templateId)!;
  const put = await call(`/papers/templates/${templateId}`, { method: "PUT", cookie: office, body: {
    name: v.name, fields: v.fields.map((f) => ({ id: f.id, label: f.label, skip: f.skip })), seeRoles: [], seeUserIds: [], mode: "notify", approverIds: [], notifyIds: [officeUser], stamp: false, active: true,
  } });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const r = await call("/papers", { method: "POST", cookie: sales, body: { templateId, values: { 1: "شركة تانية" } } });
  assert.equal(r.status, 201);
  assert.equal((r.body as PaperRow).status, "ready");
  assert.equal((r.body as PaperRow).canDownload, true);
  assert.ok(await prisma.notification.findFirst({ where: { userId: officeUser, event: "paper.issued", text: { contains: (r.body as PaperRow).code } } }));
  assert.equal((await call("/papers", { method: "POST", cookie: sales, body: { templateId, values: {} } })).status, 400); // nothing filled
  assert.equal((await call(`/papers/templates/${templateId}`, { method: "DELETE", cookie: office })).status, 204);
  assert.equal(((await call("/papers/templates", { cookie: sales })).body as TemplateCard[]).some((c) => c.id === templateId), false);
  assert.ok(((await call("/papers/mine", { cookie: sales })).body as PaperRow[]).some((x) => x.id === (r.body as PaperRow).id)); // what he issued stays
});
