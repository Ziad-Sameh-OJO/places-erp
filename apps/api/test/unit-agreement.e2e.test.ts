/**
 * 2.31 · an Income unit's «Agreement» (M-03 «INCOME · agreement · ملف (يترفع على السيستم)»): uploaded through core/files
 * and set by whoever edits units, opened by whoever sees the unit, following the field permissions (M-09). Needs file
 * storage. Manar = inventory, Mohamed Mohsen = sales, Basant = HR (no inventory), Ahmed Islam = admin.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { API, PW, call, session } from "./helpers.ts";

const up = await fetch(process.env.S3_ENDPOINT ?? "http://localhost:9000").then(() => true, () => false);
const skip = !up && !process.env.CI ? "file storage isn't running (pnpm files:local or pnpm infra:up)" : false;

const stamp = String(Date.now());
const P = `E2E ${stamp} agreement`;
const KEY = `e2e-agreement-${stamp}`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let admin: string, manar: string, sales: string, hr: string, person: string, roleId: string, userId: string, agentId: string, income: string, rent: string;
const files: string[] = [];

before(async () => {
  [admin, manar, sales, hr] = await Promise.all(["ahmed.islam@places.com", "manar.ahmed@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  // a role that edits the inventory, for the field permissions
  const role = await prisma.role.create({ data: { key: KEY, label: `E2E agreement ${stamp}`, tier: "Executive Staff", scope: "ALL", permissions: { create: [{ module: "inventory", actions: ["view", "edit"] }] } } });
  roleId = role.id;
  const email = `agreement-${stamp}@places.test`;
  userId = (await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } })).id;
  person = await session(email);
});
after(async () => {
  const units = await prisma.unit.findMany({ where: { project: { startsWith: P } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...units.map((u) => u.id), roleId] } }, { userId }] } });
  await prisma.unit.deleteMany({ where: { project: { startsWith: P } } });
  await prisma.file.deleteMany({ where: { id: { in: files } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
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
const create = async (body: object) => {
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: { project: `${P} ${Math.random()}`, area: "أكتوبر", space: 250, condition: "متشطب", agentId, ...body } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as { id: string }).id;
};
const set = (cookie: string, unitId: string, fileId: string) => call(`/inventory/units/${unitId}/agreement`, { method: "PUT", cookie, body: { fileId } });
const open = (cookie: string, unitId: string) => fetch(`${API}/inventory/units/${unitId}/agreement`, { headers: { cookie }, redirect: "manual" });
const row = async (cookie: string, unitId: string) => (await call(`/inventory/units/${unitId}`, { cookie })).body as { agreement: boolean };

test("Manar uploads the Agreement of an Income unit, and it opens", { skip }, async () => {
  income = await create({ type: "Income", pricePerSqm: "36000", leasePerSqm: "270" });
  rent = await create({ type: "Rent", pricePerSqm: "1100" });
  assert.equal((await row(manar, income)).agreement, false);
  assert.equal((await open(manar, income)).status, 404, "none yet");

  const pdf = await upload(manar, "عقد الإيجار.pdf", "application/pdf", PDF);
  assert.equal((await set(manar, income, pdf)).status, 204);
  assert.equal((await row(manar, income)).agreement, true);
  const r = await open(manar, income);
  assert.equal(r.status, 302);
  const file = await fetch(r.headers.get("location")!);
  assert.equal(file.status, 200);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), PDF);
  const audit = await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: income, action: "agreement" } });
  assert.deepEqual([audit?.before, audit?.after], [{ agreementFileId: null }, { agreementFileId: pdf }]);
  // a new one replaces it
  const second = await upload(manar, "ملحق.pdf", "application/pdf", PDF);
  assert.equal((await set(manar, income, second)).status, 204);
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: income } })).agreementFileId, second);
  // the PDF of the unit isn't made from it: no new confirm
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: income } })).pdfStatus, "draft");
});

test("refused: not Income, not a PDF, someone else's upload; sales and HR can't set it", { skip }, async () => {
  const pdf = await upload(manar, "agreement.pdf", "application/pdf", PDF);
  assert.equal((await set(manar, rent, pdf)).status, 400);
  const png = await upload(manar, "photo.png", "image/png", PNG);
  assert.equal((await set(manar, income, png)).status, 400);
  const theirs = await upload(person, "theirs.pdf", "application/pdf", PDF);
  assert.equal((await set(manar, income, theirs)).status, 400);
  assert.equal((await set(sales, income, pdf)).status, 403);
  assert.equal((await set(hr, income, pdf)).status, 403);
  assert.equal((await open(hr, income)).status, 403);
  assert.equal((await set(manar, "nope", pdf)).status, 404);
});

test("sales open it once the unit is published; a role the field is hidden for never sees it", { skip }, async () => {
  assert.equal((await open(sales, income)).status, 404, "a draft isn't for sales (Q15)");
  assert.equal((await call(`/inventory/units/${income}/pdf/confirm`, { method: "POST", cookie: manar })).status, 204);
  assert.equal((await open(sales, income)).status, 302);
  assert.equal((await row(sales, income)).agreement, true);

  const fields = (rules: object) => call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body: { module: "inventory", rules } });
  assert.equal((await fields({ agreement: "read" })).status, 204);
  assert.equal((await open(person, income)).status, 302, "read only: opens");
  assert.equal((await set(person, income, await upload(person, "x.pdf", "application/pdf", PDF))).status, 403, "read only: can't set");
  assert.equal((await fields({ agreement: "hide" })).status, 204);
  assert.equal((await row(person, income)).agreement, false);
  assert.equal((await open(person, income)).status, 403);
});
