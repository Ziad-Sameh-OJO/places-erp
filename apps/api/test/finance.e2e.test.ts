/**
 * 9.1 + 9.5 · the chart of accounts and the journal (M-07) against the real API and database: only finance reads it
 * (sales get 403), only the accountant adds accounts (the admin's finance role is view / export), a sub-account's code
 * comes from its parent, an opening balance posts a balanced entry, a parent = the sum of its children, the tree stays
 * balanced (assets = liabilities + equity), a used account can't be removed, and an entry can't post to a parent.
 * Ahmed Ashraf = accountant, Mohamed Mohsen = sales, Safwat = admin.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const P = `E2E ${Date.now()}`;
let ahmed: string, sales: string, admin: string;
const entryIds: string[] = [];

interface Node { id: string; code: string; name: string; balance: string; removable: boolean; children: Node[] }
const find = (nodes: Node[], code: string): Node | undefined => {
  for (const n of nodes) { if (n.code === code) return n; const c = find(n.children, code); if (c) return c; }
  return undefined;
};
const cents = (s: string) => Math.round(Number(s) * 100);

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [ahmed, sales, admin] = await Promise.all(["ahmed.ashraf@places.com", "m.mohsen@places.com", adminEmail].map((e) => session(e)));
});
after(async () => {
  const accounts = (await prisma.account.findMany({ where: { name: { startsWith: P } }, select: { id: true } })).map((a) => a.id);
  const entries = (await prisma.journalEntry.findMany({ where: { OR: [{ id: { in: entryIds } }, { sourceId: { in: accounts } }, { lines: { some: { accountId: { in: accounts } } } }] }, select: { id: true } })).map((e) => e.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...accounts, ...entries] } } });
  await prisma.journalEntry.deleteMany({ where: { id: { in: entries } } });
  await prisma.account.deleteMany({ where: { id: { in: accounts } } });
  await prisma.$disconnect();
});

test("only finance sees the chart: the accountant 200, sales 403 (M-09 matrix)", async () => {
  const ok = await call("/finance/accounts", { cookie: ahmed });
  assert.equal(ok.status, 200);
  const roots = (ok.body.roots as Node[]).map((r) => r.code);
  assert.deepEqual(roots, ["1", "2", "3", "4", "5"]);
  assert.equal((await call("/finance/accounts", { cookie: sales })).status, 403);
  assert.equal((await call("/finance/journal", { cookie: sales })).status, 403);
});

test("the admin can view but not add accounts (finance: view / export)", async () => {
  assert.equal((await call("/finance/accounts", { cookie: admin })).status, 200);
  const chart = (await call("/finance/accounts", { cookie: ahmed })).body;
  const longTerm = find(chart.roots, "22")!;
  assert.equal((await call("/finance/accounts", { method: "POST", cookie: admin, body: { parentId: longTerm.id, name: `${P} ممنوع` } })).status, 403);
});

test("a loan under 22 with an opening balance from CIB: code from the parent, a balanced entry, parent = sum of children (M-07, 4 Nov)", async () => {
  const chart = (await call("/finance/accounts", { cookie: ahmed })).body;
  const longTerm = find(chart.roots, "22")!, cib = find(chart.roots, "11201")!;
  const before22 = cents(longTerm.balance), beforeCib = cents(cib.balance);
  const r = await call("/finance/accounts", { method: "POST", cookie: ahmed, body: { parentId: longTerm.id, name: `${P} قرض بنك مصر`, opening: "100000", counterId: cib.id } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.code, /^22\d{2}$/);

  const after = (await call("/finance/accounts", { cookie: ahmed })).body;
  const loan = find(after.roots, r.body.code)!, parent = find(after.roots, "22")!;
  assert.equal(cents(loan.balance), 100_000_00);
  assert.equal(cents(parent.balance), before22 + 100_000_00);
  assert.equal(cents(parent.balance), parent.children.reduce((s, c) => s + cents(c.balance), 0));
  assert.equal(cents(find(after.roots, "11201")!.balance), beforeCib + 100_000_00); // the bank got the money (debit)
  assert.equal(after.check.balanced, true);
  assert.equal(loan.removable, false); // it has a movement now

  const ledger = await call(`/finance/accounts/${loan.id}/ledger`, { cookie: ahmed });
  assert.equal(ledger.status, 200);
  assert.equal(ledger.body.lines.length, 1);
  assert.equal(ledger.body.lines[0].nature, "رصيد افتتاحي");
  assert.deepEqual(ledger.body.account.path.slice(0, 2), ["الخصوم", "الالتزامات طويلة الاجل"]);

  // the opening entry is in the journal, balanced, with the bank on the debit side
  const j = await call(`/finance/journal?accountId=${loan.id}`, { cookie: ahmed });
  assert.equal(j.status, 200);
  const e = j.body.items[0];
  entryIds.push(e.id);
  assert.equal(e.debit, e.credit);
  assert.equal(e.lines.find((l: { code: string }) => l.code === "11201").debit, "100000.00");
  assert.equal(j.body.totals.balanced, true);

  // the change is in the audit log
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Account", entityId: loan.id, action: "create" } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "JournalEntry", entityId: e.id, action: "post" } }));
});

test("a used account can't be removed; a new empty one can (M-07, 4 Nov)", async () => {
  const chart = (await call("/finance/accounts", { cookie: ahmed })).body;
  const used = find(chart.roots, "22")!.children.find((c: Node) => c.name.startsWith(P))!;
  assert.equal((await call(`/finance/accounts/${used.id}`, { method: "DELETE", cookie: ahmed })).status, 400);
  const fixed = find(chart.roots, "5203")!; // بوفيه, from the accountant's chart
  assert.equal((await call(`/finance/accounts/${fixed.id}`, { method: "DELETE", cookie: ahmed })).status, 400);
  const empty = await call("/finance/accounts", { method: "POST", cookie: ahmed, body: { parentId: find(chart.roots, "54")!.id, name: `${P} رسوم تجربة` } });
  assert.equal(empty.status, 201);
  assert.equal((await call(`/finance/accounts/${empty.body.id}`, { method: "DELETE", cookie: ahmed })).status, 200);
  assert.equal(find((await call("/finance/accounts", { cookie: ahmed })).body.roots, empty.body.code), undefined);
});

test("opening balances close against retained earnings; an entry can't post to a parent account (M-07 9.5)", async () => {
  const chart = (await call("/finance/accounts", { cookie: ahmed })).body;
  const parent = find(chart.roots, "111")!; // الخزينة: has sub-accounts
  const bad = await call("/finance/opening", { method: "POST", cookie: ahmed, body: { date: "2026-11-01", lines: [{ accountId: parent.id, amount: "1000" }] } });
  assert.equal(bad.status, 400);
  const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const future = await call("/finance/opening", { method: "POST", cookie: ahmed, body: { date: tomorrow, lines: [{ accountId: find(chart.roots, "11101")!.id, amount: "1000" }] } });
  assert.equal(future.status, 400);

  const ok = await call("/finance/opening", { method: "POST", cookie: ahmed, body: { date: "2026-11-01", lines: [{ accountId: find(chart.roots, "11104")!.id, amount: "9800" }] } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  entryIds.push(ok.body.id);
  const entry = (await call(`/finance/journal/${ok.body.id}`, { cookie: ahmed })).body;
  assert.equal(entry.debit, "9800.00");
  assert.equal(entry.credit, "9800.00");
  assert.equal(entry.lines.find((l: { code: string }) => l.code === "33").credit, "9800.00");
});
