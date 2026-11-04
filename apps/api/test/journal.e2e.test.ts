/**
 * 9.13 · manual journal entries and 9.8 · periods (M-07, the accountant's meeting 4 Nov): «قيد يومية جديد» posts
 * JV-M… with «قيد يدوي», moves the tree and shows its effect; refused unless balanced, two lines, an open month;
 * editing a posted manual entry needs finance «approve» and is audited (43). Closing the month is approve-only.
 * (The close itself isn't run here: test files run in parallel and a closed month would stop the others.)
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const P = `E2E ${Date.now()}`;
let ahmed: string, sales: string, admin: string, mokhtar: string;
const entries: string[] = [];
interface Node { id: string; code: string; balance: string; children: Node[] }
const find = (nodes: Node[], code: string): Node | undefined => { for (const n of nodes) { if (n.code === code) return n; const c = find(n.children, code); if (c) return c; } return undefined; };
const cents = (s: string) => Math.round(Number(s) * 100);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const chart = async () => (await call("/finance/accounts", { cookie: ahmed })).body.roots as Node[];
const entry = async (body: Record<string, unknown>, cookie = ahmed) => {
  const r = await call("/finance/journal", { method: "POST", cookie, body: { date: today(), memo: `${P} قيد`, ...body } });
  if (r.status === 201) entries.push(r.body.entry.id);
  return r;
};

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [ahmed, sales, admin, mokhtar] = await Promise.all(["ahmed.ashraf@places.com", "m.mohsen@places.com", adminEmail, "mokhtar.gamal@places.com"].map((e) => session(e)));
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: entries } } });
  await prisma.journalEntry.deleteMany({ where: { id: { in: entries } } });
  await prisma.$disconnect();
});

test("a manual entry: JV-M…, «قيد يدوي», the tree moves, the effect shows (9.13)", async () => {
  const c = await chart(), safe = find(c, "11104")!, buffet = find(c, "5203")!;
  const r = await entry({ lines: [{ accountId: buffet.id, debit: "120", credit: "0" }, { accountId: safe.id, debit: "0", credit: "120" }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.entry.no, /^JV-M\d+$/);
  assert.equal(r.body.entry.nature, "قيد يدوي");
  const after = await chart();
  assert.equal(cents(find(after, "5203")!.balance), cents(buffet.balance) + 120_00);
  assert.equal(cents(find(after, "11104")!.balance), cents(safe.balance) - 120_00);
  assert.deepEqual(r.body.effect.map((e: { code: string }) => e.code).sort(), ["11104", "5203"]);
  const ledger = (await call(`/finance/accounts/${buffet.id}/ledger`, { cookie: ahmed })).body;
  assert.ok(ledger.lines.some((l: { entryId: string; no: string }) => l.entryId === r.body.entry.id && l.no.startsWith("JV-M")));
});

test("refusals: unbalanced, one line, a line both sides, a parent, a closed month (last month), no permission", async () => {
  const c = await chart(), a = find(c, "11104")!.id, b = find(c, "5203")!.id;
  assert.equal((await entry({ lines: [{ accountId: b, debit: "100", credit: "0" }, { accountId: a, debit: "0", credit: "90" }] })).body.error, "القيد مش متوازن: المدين لازم يساوي الدائن");
  assert.equal((await entry({ lines: [{ accountId: b, debit: "100", credit: "0" }] })).status, 400);
  assert.equal((await entry({ lines: [{ accountId: b, debit: "100", credit: "100" }, { accountId: a, debit: "0", credit: "0" }] })).status, 400);
  assert.equal((await entry({ lines: [{ accountId: find(c, "52")!.id, debit: "10", credit: "0" }, { accountId: a, debit: "0", credit: "10" }] })).status, 400);
  const d = new Date(`${today().slice(0, 7)}-01T00:00:00Z`); d.setUTCDate(0); // the last day of last month
  const closed = await entry({ date: d.toISOString().slice(0, 10), lines: [{ accountId: b, debit: "10", credit: "0" }, { accountId: a, debit: "0", credit: "10" }] });
  assert.equal(closed.status, 400);
  assert.match(closed.body.error, /مقفول/);
  assert.equal((await entry({ lines: [{ accountId: b, debit: "10", credit: "0" }, { accountId: a, debit: "0", credit: "10" }] }, sales)).status, 403);
  assert.equal((await entry({ lines: [{ accountId: b, debit: "10", credit: "0" }, { accountId: a, debit: "0", credit: "10" }] }, admin)).status, 403);
});

test("editing a manual entry: finance «approve» only, same number, audited before → after (M-07 43)", async () => {
  const c = await chart(), a = find(c, "11104")!.id, b = find(c, "5203")!.id;
  const r = await entry({ lines: [{ accountId: b, debit: "50", credit: "0" }, { accountId: a, debit: "0", credit: "50" }] });
  const body = { date: today(), memo: `${P} اتعدّل`, lines: [{ accountId: b, debit: "75", credit: "0" }, { accountId: a, debit: "0", credit: "75" }] };
  assert.equal((await call(`/finance/journal/${r.body.entry.id}`, { method: "PUT", cookie: mokhtar, body })).status, 403);
  const ok = await call(`/finance/journal/${r.body.entry.id}`, { method: "PUT", cookie: ahmed, body });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.entry.no, r.body.entry.no);
  assert.equal(ok.body.entry.debit, "75.00");
  const log = await prisma.auditLog.findFirst({ where: { entity: "JournalEntry", entityId: r.body.entry.id, action: "update" } });
  assert.ok(log);
  // an automatic entry (an opening) isn't edited here
  const opening = await prisma.journalEntry.findFirst({ where: { source: { not: "manual" } }, select: { id: true } });
  if (opening) assert.equal((await call(`/finance/journal/${opening.id}`, { method: "PUT", cookie: ahmed, body })).status, 400);
});

test("periods: this month open, last month closed by itself; closing is approve-only (9.8)", async () => {
  const p = (await call("/finance/periods", { cookie: ahmed })).body;
  assert.equal(p.length, 6);
  assert.equal(p.at(-1).status, "open");
  assert.equal(p.at(-2).status, "month");
  assert.equal((await call("/finance/periods", { cookie: sales })).status, 403);
  assert.equal((await call("/finance/periods/close", { method: "POST", cookie: admin, body: { kind: "month" } })).status, 403);
  assert.equal((await call("/finance/periods/close", { method: "POST", cookie: mokhtar, body: { kind: "month" } })).status, 403);
});
