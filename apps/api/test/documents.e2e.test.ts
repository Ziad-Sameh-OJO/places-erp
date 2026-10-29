/** 0.10 Arabic PDFs (Playwright) against the real API. Ahmed (Super Admin) may print the sample; Mohsen (sales) may not. */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const up = await fetch(process.env.S3_ENDPOINT ?? "http://localhost:9000").then(() => true, () => false);
const skip = !up && !process.env.CI ? "file storage isn't running (pnpm files:local or pnpm infra:up)" : false;
let admin: string, sales: string;

before(async () => {
  [admin, sales] = await Promise.all([session("ahmed.islam@places.com"), session("m.mohsen@places.com")]);
});
after(() => prisma.$disconnect());

test("the sample PDF: A4, IBM Plex Sans Arabic embedded; sales 403, signed out 401", async () => {
  const res = await fetch(`${API}/documents/sample`, { headers: { cookie: admin } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const pdf = Buffer.from(await res.arrayBuffer()).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-"));
  // the Arabic font is in the file itself (no fallback font, no network): that's what shapes the letters
  assert.match(pdf, /IBMPlexSansArabic-Regular/);
  assert.match(pdf, /IBMPlexSansArabic-Bold/);
  assert.match(pdf, /\/MediaBox \[0 0 59[45]\.\d+ 84[12]\.\d+\]/); // A4 (595 × 842 pt)
  assert.equal((await fetch(`${API}/documents/sample`, { headers: { cookie: sales } })).status, 403);
  assert.equal((await fetch(`${API}/documents/sample`)).status, 401);
});

test("saving a PDF keeps it in storage, audited, with a working short link", { skip }, async () => {
  const r = await call("/documents/sample", { method: "POST", cookie: admin });
  assert.equal(r.status, 201);
  const got = await fetch(r.body.url);
  assert.equal(got.status, 200);
  assert.ok(Buffer.from(await got.arrayBuffer()).toString("latin1").startsWith("%PDF-"));
  const log = await prisma.auditLog.findFirst({ where: { entity: "File", entityId: r.body.id } });
  assert.equal(log?.action, "create");
  await prisma.file.delete({ where: { id: r.body.id } });
});
