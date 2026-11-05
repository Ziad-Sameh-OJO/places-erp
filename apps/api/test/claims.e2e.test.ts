/**
 * 12.12 + 9.17 against the real API: the stamp and signature (Super Admin only) land on the voucher PDF; the entities'
 * bank details and the templates are edited and reset; a claim goes requested → issued → client approved → e-invoice
 * → collected, which posts a 100,000 receive voucher on a commission line and makes the cash receipt RC-<n>.
 * Mohamed Mohsen = sales (asks), Ahmed Ashraf = accountant, the Super Admin. Its own safe and revenue line (prefix).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";
import { balance, cleanFinance, fresh } from "./finance-helpers.ts";

const up = await fetch(process.env.S3_ENDPOINT ?? "http://localhost:9000").then(() => true, () => false);
const skip = !up && !process.env.CI ? "file storage isn't running (pnpm files:local or pnpm infra:up)" : false;
const START = new Date();
const P = `E2E claims ${START.getTime()}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let acc: string, sales: string, admin: string;
let safe: { id: string }, income: { id: string };
let stampBefore: unknown;

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [acc, sales, admin] = await Promise.all(["ahmed.ashraf@places.com", "m.mohsen@places.com", adminEmail].map((e) => session(e)));
  safe = await fresh(acc, P, "112", "بنك");
  income = await fresh(acc, P, "41", "عمولات");
  stampBefore = (await prisma.setting.findUnique({ where: { key: "stamp" } }))?.value;
});
after(async () => {
  const claims = (await prisma.claim.findMany({ where: { company: { startsWith: P } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: claims } } });
  await prisma.claim.deleteMany({ where: { id: { in: claims } } });
  await cleanFinance(P, START);
  if (stampBefore === undefined) await prisma.setting.deleteMany({ where: { key: "stamp" } });
  else await prisma.setting.update({ where: { key: "stamp" }, data: { value: stampBefore as object } });
  await prisma.$disconnect();
});

const pdf = async (path: string, cookie: string) => {
  const r = await fetch(`${API}${path}`, { headers: { cookie } });
  return { status: r.status, type: r.headers.get("content-type"), body: Buffer.from(await r.arrayBuffer()).toString("latin1") };
};

test("12.12 settings: everyone with «master» reads; only the Super Admin sets the stamp; sales can't edit", async () => {
  const s = await call("/settings/documents", { cookie: acc });
  assert.equal(s.status, 200);
  assert.deepEqual(s.body.entities.map((e: { id: string }) => e.id), ["places", "zrain"]);
  assert.deepEqual(s.body.templates.map((t: { kind: string }) => t.kind), ["claim", "receipt", "installment"]);
  assert.equal((await call("/settings/documents", { cookie: sales })).status, 403);
  // the accountant has «master: edit» but isn't the Super Admin
  assert.equal((await call("/settings/stamp", { method: "PUT", cookie: acc, body: { kind: "stamp", fileId: null } })).status, 403);
  assert.equal((await call("/settings/stamp", { method: "PUT", cookie: sales, body: { kind: "stamp", fileId: null } })).status, 403);
  assert.equal((await call("/settings/stamp", { method: "PUT", cookie: admin, body: { kind: "stamp", fileId: null } })).status, 204);
  assert.equal((await call("/settings/entities/zrain", { method: "PUT", cookie: sales, body: { bank: "x", accountName: "", accountNo: "", iban: "" } })).status, 403);
});

test("12.12 templates: edited, audited, previewed as a PDF, and «رجّع الافتراضي»", async () => {
  const body = { title: "مطالبة مالية", body: `${P} السادة / {الشركة} · {المبلغ_بالحروف}`, closing: "شكراً" };
  assert.equal((await call("/settings/templates/claim", { method: "PUT", cookie: acc, body })).status, 204);
  const t = (await call("/settings/documents", { cookie: acc })).body.templates.find((x: { kind: string }) => x.kind === "claim");
  assert.equal(t.custom, true);
  assert.equal(t.body, body.body);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "DocTemplate", entityId: "claim", at: { gte: START } } }));
  const p = await pdf("/settings/templates/claim/preview", acc);
  assert.equal(p.status, 200);
  assert.ok(p.body.startsWith("%PDF-"));
  assert.equal((await call("/settings/templates/claim", { method: "DELETE", cookie: acc })).status, 204);
  assert.equal((await call("/settings/documents", { cookie: acc })).body.templates[0].custom, false);
  assert.equal((await call("/settings/templates/claim", { method: "PUT", cookie: sales, body })).status, 403);
});

test("9.17 the whole claim: requested → issued → client approved → e-invoice → collected with the receipt", async () => {
  const claim = { company: `${P} شركة النيل`, unit: "U-101", unitInfo: "Mivida · مبنى B4 · الدور 2 · 95 م²", amount: "100000", side: "client", kind: "عمولة تأجير", entityId: "places" };
  assert.equal((await call("/claims", { method: "POST", cookie: acc, body: claim })).status, 403); // the accountant doesn't ask for claims
  const c = await call("/claims", { method: "POST", cookie: sales, body: claim });
  assert.equal(c.status, 201);
  assert.equal(c.body.status, "requested");
  const id = c.body.id as string;

  assert.equal((await call(`/claims/${id}/issue`, { method: "POST", cookie: sales })).status, 403);
  assert.equal((await pdf(`/claims/${id}/pdf`, sales)).status, 400); // not issued yet
  assert.equal((await call(`/claims/${id}/issue`, { method: "POST", cookie: acc })).status, 204);
  assert.equal((await call(`/claims/${id}/issue`, { method: "POST", cookie: acc })).status, 400); // already issued
  const doc = await pdf(`/claims/${id}/pdf?doc=claim`, sales);
  assert.equal(doc.status, 200);
  assert.equal(doc.type, "application/pdf");
  assert.ok(await prisma.notification.findFirst({ where: { text: { contains: `جاهزة · ابعتها لـ ${P}` } } }));

  assert.equal((await call(`/claims/${id}/client-approved`, { method: "POST", cookie: admin })).status, 404); // not the one who asked
  assert.equal((await call(`/claims/${id}/client-approved`, { method: "POST", cookie: sales })).status, 204);
  assert.equal((await call(`/claims/${id}/einvoice`, { method: "POST", cookie: sales, body: { no: "EG-1", date: "2026-11-01" } })).status, 403);
  assert.equal((await call(`/claims/${id}/einvoice`, { method: "POST", cookie: acc, body: { no: "EG-2026-001245", date: "2026-11-01" } })).status, 204);
  assert.equal((await call(`/claims/${id}/ask-receipt`, { method: "POST", cookie: sales })).status, 204);
  assert.equal((await pdf(`/claims/${id}/pdf?doc=receipt`, sales)).status, 400); // not collected yet

  const before = await balance(acc, income.id);
  assert.equal((await call(`/claims/${id}/collect`, { method: "POST", cookie: admin, body: { toId: safe.id, accountId: income.id } })).status, 403);
  assert.equal((await call(`/claims/${id}/collect`, { method: "POST", cookie: acc, body: { toId: safe.id, accountId: income.id } })).status, 204);
  assert.equal(await balance(acc, income.id), before + 100_000_00);
  assert.equal(await balance(acc, safe.id), 100_000_00);

  const mine = (await call("/claims?status=paid", { cookie: sales })).body;
  const paid = mine.items.find((x: { id: string }) => x.id === id);
  assert.equal(paid.status, "paid");
  assert.match(paid.receiptNo, /^RC-\d+$/);
  assert.equal(paid.einvoice.no, "EG-2026-001245");
  assert.match(paid.move.no, /^MV-\d+$/);
  const move = await prisma.treasuryMove.findUniqueOrThrow({ where: { id: paid.move.id } });
  assert.equal(move.kind, "receive");
  assert.equal(move.ref, paid.no);
  assert.equal(move.amount.toFixed(2), "100000.00");
  assert.equal((await prisma.claim.findUniqueOrThrow({ where: { id } })).payMethod, "تحويل بنكي");
  assert.equal((await pdf(`/claims/${id}/pdf?doc=receipt`, sales)).status, 200);
  // the admin (finance view) sees it; the steps were audited
  assert.ok((await call("/claims?status=all", { cookie: admin })).body.items.some((x: { id: string }) => x.id === id));
  assert.equal(await prisma.auditLog.count({ where: { entity: "Claim", entityId: id } }), 6);
});

test("9.17 a rejected claim stops there, with the reason to the one who asked", async () => {
  const c = await call("/claims", { method: "POST", cookie: sales, body: { company: `${P} مرفوضة`, unit: "U-1", unitInfo: "x", amount: "5000", side: "owner", kind: "عمولة بيع", entityId: "zrain" } });
  assert.equal((await call(`/claims/${c.body.id}/reject`, { method: "POST", cookie: acc, body: { why: "" } })).status, 400);
  assert.equal((await call(`/claims/${c.body.id}/reject`, { method: "POST", cookie: acc, body: { why: `${P} المبلغ غلط` } })).status, 204);
  assert.equal((await call(`/claims/${c.body.id}/issue`, { method: "POST", cookie: acc })).status, 400);
  assert.ok(await prisma.notification.findFirst({ where: { text: { contains: `${P} المبلغ غلط` } } }));
  // another salesperson's claims aren't in your list
  assert.ok((await call("/claims?status=all", { cookie: sales })).body.items.every((x: { by: { id: string } }) => x.by.id === c.body.by.id));
});

test("12.12 the stamp and signature are printed on the voucher's PDF", { skip }, async () => {
  const up1 = await call("/files/uploads", { method: "POST", cookie: admin, body: { name: "stamp.png", mime: "image/png", size: PNG.length } });
  await fetch(up1.body.url, { method: "PUT", headers: up1.body.headers, body: PNG });
  await call(`/files/${up1.body.id}/complete`, { method: "POST", cookie: admin });
  assert.equal((await call("/settings/stamp", { method: "PUT", cookie: admin, body: { kind: "stamp", fileId: up1.body.id } })).status, 204);
  const m = await call("/finance/moves", { method: "POST", cookie: acc, body: { kind: "receive", toId: safe.id, accountId: (await fresh(acc, P, "42", "إيراد")).id, amount: "10", party: "x", memo: `${P} ختم` } });
  const v = await pdf(`/finance/moves/${m.body.move.id}/pdf`, admin);
  assert.equal(v.status, 200);
  assert.match(v.body, /\/Subtype\s*\/Image/);
  assert.equal((await pdf(`/finance/moves/${m.body.move.id}/pdf`, sales)).status, 403);
  await prisma.file.delete({ where: { id: up1.body.id } });
});
