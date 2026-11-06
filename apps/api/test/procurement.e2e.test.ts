/**
 * 10.1 · 10.2 · 10.3 · purchase requests against the real API (M-08): approvals by limit (Q44), over the budget only
 * management (Q45), never your own (4.1), a new amount at settling goes back for approval (2.3), a receipt above
 * 10,000 (0.9), finance posts the settled request with a payment voucher that moves the safe and the line (10.2),
 * and the approvers' reminder after a working day, once (2.4).
 * Mokhtar = procurement · Nancy = approver (up to 50,000) · Ahmed Ashraf = accountant + approver above the limit ·
 * the admin = management · Mohamed Mohsen = sales (403).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, mark, session } from "./helpers.ts";
import { procurementReminderTick } from "../../worker/src/processors/procurement-reminder.ts";

const START = new Date();
const P = `E2E procurement ${START.getTime()}`; // own word: files start in the same millisecond
mark(P); // the requests are mailed to the approvers too
let mokhtar: string, nancy: string, ashraf: string, admin: string, sales: string, mokhtarId: string;
const ids = { purchases: [] as string[], files: [] as string[], moves: [] as string[], budgets: [] as string[] };
interface Node { id: string; code: string; balance: string; children: Node[] }
const find = (nodes: Node[], code: string): Node | undefined => { for (const n of nodes) { if (n.code === code) return n; const c = find(n.children, code); if (c) return c; } return undefined; };
const cents = (s: string) => Math.round(Number(s) * 100);
const chart = async () => (await call("/finance/accounts", { cookie: ashraf })).body.roots as Node[];
const bal = async (code: string) => cents(find(await chart(), code)!.balance);
const id = async (code: string) => find(await chart(), code)!.id;

const ask = async (body: Record<string, unknown>, cookie = mokhtar) => {
  const r = await call("/procurement/purchases", { method: "POST", cookie, body: { item: `${P} طلب`, accountId: await id("5207"), ...body } });
  if (r.status === 201) ids.purchases.push(r.body.id);
  return r;
};
const decide = (pid: string, cookie: string, decision = "Approved", reason?: string) =>
  call(`/procurement/purchases/${pid}/decision`, { method: "POST", cookie, body: { decision, ...(reason ? { reason } : {}) } });
const settle = async (pid: string, amount: string) => call(`/procurement/purchases/${pid}/settle`, { method: "POST", cookie: mokhtar, body: { paidFromId: await id("11103"), amount } });
/** A finished upload, as the files module leaves it (no MinIO needed: only the record matters here). */
const upload = async () => {
  const f = await prisma.file.create({ data: { key: `e2e/${P}-${ids.files.length}.pdf`, name: "عرض سعر.pdf", mime: "application/pdf", size: 10, status: "READY", uploadedById: mokhtarId } });
  ids.files.push(f.id);
  return f.id;
};

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [mokhtar, nancy, ashraf, admin, sales] = await Promise.all(["mokhtar.gamal@places.com", "nancy.islam@places.com", "ahmed.ashraf@places.com", adminEmail, "m.mohsen@places.com"].map((e) => session(e)));
  mokhtarId = (await prisma.user.findUniqueOrThrow({ where: { email: "mokhtar.gamal@places.com" } })).id;
});
after(async () => {
  const purchases = await prisma.purchase.findMany({ where: { OR: [{ id: { in: ids.purchases } }, { item: { startsWith: P } }] }, select: { id: true, moveId: true } });
  const moveIds = [...ids.moves, ...purchases.flatMap((p) => (p.moveId ? [p.moveId] : []))];
  const moves = await prisma.treasuryMove.findMany({ where: { id: { in: moveIds } }, select: { id: true, entryId: true } });
  await prisma.purchase.deleteMany({ where: { id: { in: purchases.map((p) => p.id) } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...purchases.map((p) => p.id), ...moves.flatMap((m) => [m.id, m.entryId]), ...ids.budgets, ...ids.files] } } });
  await prisma.treasuryMove.deleteMany({ where: { id: { in: moves.map((m) => m.id) } } });
  await prisma.journalEntry.deleteMany({ where: { id: { in: moves.map((m) => m.entryId) } } });
  await prisma.budgetLine.deleteMany({ where: { id: { in: ids.budgets } } });
  await prisma.file.deleteMany({ where: { id: { in: ids.files } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

test("who may do what: sales 403 everywhere, only procurement asks, only approvers decide, only finance posts", async () => {
  assert.equal((await call("/procurement/purchases", { cookie: sales })).status, 403);
  assert.equal((await call("/procurement/overview", { cookie: sales })).status, 403);
  assert.equal((await ask({ amount: "100" }, sales)).status, 403);
  assert.equal((await ask({ amount: "100" }, nancy)).status, 403);
  const r = await ask({ amount: "100" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, "Pending");
  assert.match(r.body.no, /^PR-\d+$/);
  assert.equal((await decide(r.body.id, mokhtar)).status, 403);
  assert.equal((await call(`/procurement/purchases/${r.body.id}/post`, { method: "POST", cookie: nancy, body: { fromId: await id("11103") } })).status, 403);
  assert.equal((await call("/procurement/purchases/settled", { cookie: mokhtar })).status, 403);
  assert.equal((await call("/procurement/custody-cap", { method: "PUT", cookie: mokhtar, body: { accountId: await id("11103"), cap: "50000" } })).status, 403);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Purchase", entityId: r.body.id, action: "create" } }));
});

test("0.9 · above 10,000 a receipt or two quotes are attached, and only files you uploaded yourself", async () => {
  const none = await ask({ amount: "15000" });
  assert.equal(none.status, 400);
  assert.match(none.body.error, /إيصال أو عرضين أسعار/);
  assert.match((await ask({ amount: "15000", attachments: ["not-a-file"] })).body.error, /مرفق مش موجود/);
  const ok = await ask({ amount: "15000", attachments: [await upload()] });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.attachments[0].name, "عرض سعر.pdf");
  // the link is handed out by the request's own access (signing needs no storage running)
  const file = `/procurement/purchases/${ok.body.id}/files/${ok.body.attachments[0].id}`;
  assert.match((await call(file, { cookie: nancy })).body.url, /X-Amz-Signature=/);
  assert.equal((await call(file, { cookie: sales })).status, 403);
  assert.equal((await call(`/procurement/purchases/${ok.body.id}/files/${ids.files[0]}x`, { cookie: mokhtar })).status, 404);
  // the same file can't be attached to a second request
  assert.match((await ask({ amount: "15000", attachments: [ok.body.attachments[0].id] })).body.error, /مرفق مش موجود/);
});

test("Q44 · above 50,000 Nancy can't approve, Ahmed Ashraf can; 4.1 · nobody approves their own request", async () => {
  const big = await ask({ amount: "60000", attachments: [await upload()] });
  const asNancy = await decide(big.body.id, nancy);
  assert.equal(asNancy.status, 403);
  assert.match(asNancy.body.error, /لأحمد أو صفوت/);
  assert.match((await call(`/procurement/purchases/${big.body.id}`, { cookie: nancy })).body.blocker, /لأحمد أو صفوت/);
  const ok = await decide(big.body.id, ashraf);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.status, "Approved");
  assert.equal((await decide(big.body.id, nancy)).status, 409); // already decided

  const own = await ask({ amount: "500" }, admin);
  assert.equal(own.status, 201);
  assert.match((await decide(own.body.id, admin)).body.error, /طلب انت اللي عامله/);
  // Mokhtar sees his own requests only
  assert.equal((await call(`/procurement/purchases/${own.body.id}`, { cookie: mokhtar })).status, 404);
});

test("Q45 · over the line's budget left only management approves (the same numbers as finance's budget page)", async () => {
  const line = await id("5210");
  assert.equal((await call(`/finance/budget/${line}`, { method: "PATCH", cookie: ashraf, body: { budget: "1000" } })).status, 200);
  ids.budgets.push((await prisma.budgetLine.findUniqueOrThrow({ where: { accountId: line } })).id);
  const r = await ask({ amount: "2000", accountId: line });
  assert.equal(r.body.overBudget, true);
  assert.match((await decide(r.body.id, ashraf)).body.error, /موافقة الإدارة/);
  assert.equal((await decide(r.body.id, admin)).body.status, "Approved");
});

test("a rejection needs its reason and goes back to Mokhtar with it", async () => {
  const r = await ask({ amount: "700" });
  assert.equal((await decide(r.body.id, nancy, "Rejected")).status, 400);
  const no = await decide(r.body.id, nancy, "Rejected", `${P} السعر عالي`);
  assert.equal(no.body.status, "Rejected");
  assert.equal(no.body.rejectReason, `${P} السعر عالي`);
  assert.ok(await prisma.notification.findFirst({ where: { userId: mokhtarId, text: { contains: "اترفض" }, createdAt: { gte: START } } }));
});

test("2.3 · a different amount when paying sends the request back for approval", async () => {
  const r = await ask({ amount: "5000" });
  await decide(r.body.id, nancy);
  const s = await settle(r.body.id, "6000");
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(s.body.status, "Pending");
  assert.equal(s.body.amount, "6000.00");
  assert.equal(s.body.decidedBy, null);
  assert.equal((await decide(r.body.id, nancy)).body.status, "Approved");
});

test("10.2 · the real flow: request → approval → settled → finance posts it → the safe and the line move by the amount", async () => {
  // money in Mokhtar's safe: a 10,000 receipt from other revenue
  const cash = (await call("/finance/cash", { cookie: ashraf })).body;
  const fund = await call("/finance/moves", { method: "POST", cookie: ashraf, body: { kind: "receive", toId: await id("11103"), accountId: cash.revenues[0].id, amount: "10000", party: `${P} تمويل`, memo: `${P} تمويل عهدة` } });
  assert.equal(fund.status, 201, JSON.stringify(fund.body));
  ids.moves.push(fund.body.move.id);

  const r = await ask({ amount: "3000", vendor: "Office Plus" });
  assert.equal((await decide(r.body.id, nancy)).body.status, "Approved");
  const safe0 = await bal("11103"), line0 = await bal("5207");
  const s = await settle(r.body.id, "3000");
  assert.equal(s.body.status, "Settled");
  assert.equal(s.body.paidFrom.id, await id("11103"));
  assert.equal(await bal("11103"), safe0); // procurement moves no balance (4 Nov)
  assert.ok((await prisma.notification.findMany({ where: { text: { contains: s.body.no }, createdAt: { gte: START } } })).length > 0);

  const queue = await call("/procurement/purchases/settled", { cookie: ashraf });
  assert.ok(queue.body.some((p: { id: string }) => p.id === r.body.id));
  const post = await call(`/procurement/purchases/${r.body.id}/post`, { method: "POST", cookie: ashraf, body: { fromId: await id("11103") } });
  assert.equal(post.status, 201, JSON.stringify(post.body));
  assert.equal(await bal("11103"), safe0 - 3_000_00);
  assert.equal(await bal("5207"), line0 + 3_000_00);
  const done = (await call(`/procurement/purchases/${r.body.id}`, { cookie: mokhtar })).body;
  assert.equal(done.status, "Posted");
  assert.equal(done.move.no, post.body.move.no);
  assert.equal((await call(`/procurement/purchases/${r.body.id}/post`, { method: "POST", cookie: ashraf, body: { fromId: await id("11103") } })).status, 409);
  const log = await prisma.auditLog.findMany({ where: { entity: "Purchase", entityId: r.body.id }, orderBy: { at: "asc" } });
  assert.deepEqual(log.map((l) => l.action), ["create", "approve", "settle", "post"]);
});

test("the custody ceiling: finance sets it on a safe, procurement sees it next to the balance", async () => {
  const safe = await id("11103");
  const before = await prisma.account.findUniqueOrThrow({ where: { id: safe }, select: { cap: true } });
  assert.equal((await call("/procurement/custody-cap", { method: "PUT", cookie: ashraf, body: { accountId: await id("5207"), cap: "1" } })).status, 400);
  assert.equal((await call("/procurement/custody-cap", { method: "PUT", cookie: ashraf, body: { accountId: safe, cap: "50000" } })).status, 204);
  const o = (await call("/procurement/overview", { cookie: mokhtar })).body;
  assert.equal(o.cash.find((c: { accountId: string }) => c.accountId === safe).cap, "50000.00");
  await prisma.account.update({ where: { id: safe }, data: { cap: before.cap } });
  ids.budgets.push(safe); // its audit row goes too
});

test("2.4 · the approvers are reminded after one working day, once (the job run twice)", async () => {
  const r = await ask({ amount: "400" });
  await prisma.purchase.update({ where: { id: r.body.id }, data: { createdAt: new Date(Date.now() - 7 * 86_400_000) } });
  const now = new Date();
  assert.ok((await procurementReminderTick(now)) >= 1);
  await procurementReminderTick(now);
  const nancyId = (await prisma.user.findUniqueOrThrow({ where: { email: "nancy.islam@places.com" } })).id;
  const sent = await prisma.notification.findMany({ where: { userId: nancyId, text: { contains: r.body.no + " " } } });
  assert.equal(sent.length, 1);
  await prisma.notification.deleteMany({ where: { text: { contains: r.body.no + " " }, createdAt: { gte: START } } });
});
