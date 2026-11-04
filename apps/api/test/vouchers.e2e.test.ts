/**
 * 9.2 · 9.3 · 9.11 · treasury vouchers and the budget (M-07, the accountant's meeting 4 Nov) against the real API:
 * a 1,000 payment for the buffet from the main safe moves both balances with a balanced entry; a 20,000 transfer from
 * CIB to Nancy's safe; no payment above the balance or to the same safe; an advance opens the employee's own account
 * under 131; a custody settles (spent + returned) and can't settle more than it holds; the budget warns at 80%.
 * Ahmed Ashraf = accountant (create), Mohamed Mohsen = sales (403), the admin = view only.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const START = new Date();
const P = `E2E ${START.getTime()}`;
let ahmed: string, sales: string, admin: string;
const ids = { moves: [] as string[], accounts: [] as string[] };
interface Node { id: string; code: string; balance: string; children: Node[] }
const find = (nodes: Node[], code: string): Node | undefined => { for (const n of nodes) { if (n.code === code) return n; const c = find(n.children, code); if (c) return c; } return undefined; };
const cents = (s: string) => Math.round(Number(s) * 100);
const chart = async () => (await call("/finance/accounts", { cookie: ahmed })).body.roots as Node[];
const bal = async (code: string) => cents(find(await chart(), code)!.balance);
const id = async (code: string) => find(await chart(), code)!.id;
const move = async (body: Record<string, unknown>, cookie = ahmed) => {
  const r = await call("/finance/moves", { method: "POST", cookie, body: { memo: `${P} حركة`, ...body } });
  if (r.status === 201) ids.moves.push(r.body.move.id);
  return r;
};

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [ahmed, sales, admin] = await Promise.all(["ahmed.ashraf@places.com", "m.mohsen@places.com", adminEmail].map((e) => session(e)));
  // money to move: an opening of 50,000 in the main safe and 30,000 in CIB (cleaned up after)
  const r = await call("/finance/opening", { method: "POST", cookie: ahmed, body: { date: "2026-11-01", lines: [{ accountId: await id("11101"), amount: "50000" }, { accountId: await id("11201"), amount: "30000" }] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ids.moves.push(`entry:${r.body.id}`);
});
after(async () => {
  const moves = await prisma.treasuryMove.findMany({ where: { id: { in: ids.moves } }, select: { id: true, entryId: true } });
  const entries = [...moves.map((m) => m.entryId), ...ids.moves.filter((x) => x.startsWith("entry:")).map((x) => x.slice(6))];
  const holders = (await prisma.account.findMany({ where: { holderId: { not: null }, createdAt: { gte: START } }, select: { id: true } })).map((a) => a.id);
  const budgets = (await prisma.budgetLine.findMany({ where: { name: { contains: "بوفيه" } }, select: { id: true } })).map((b) => b.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...moves.map((m) => m.id), ...entries, ...holders, ...budgets] } } });
  await prisma.treasuryMove.deleteMany({ where: { id: { in: moves.map((m) => m.id) } } });
  await prisma.journalEntry.deleteMany({ where: { id: { in: entries } } });
  await prisma.account.deleteMany({ where: { id: { in: holders } } });
  await prisma.budgetLine.deleteMany({ where: { id: { in: budgets } } });
  await prisma.notification.deleteMany({ where: { text: { startsWith: "بند «" }, createdAt: { gte: START } } });
  await prisma.$disconnect();
});

test("only finance: sales get 403, the admin views but can't post", async () => {
  assert.equal((await call("/finance/cash", { cookie: sales })).status, 403);
  assert.equal((await call("/finance/moves", { cookie: sales })).status, 403);
  assert.equal((await call("/finance/cash", { cookie: admin })).status, 200);
  assert.equal((await move({ kind: "pay", fromId: await id("11101"), accountId: await id("5203"), amount: "10", party: "x" }, admin)).status, 403);
  assert.equal((await call(`/finance/budget/${await id("5203")}`, { method: "PATCH", cookie: sales, body: { budget: "100" } })).status, 403);
});

test("a 1,000 payment for the buffet from the main safe: safe −1,000, 5203 +1,000, a balanced entry, the effect (9.2)", async () => {
  const safe0 = await bal("11101"), buffet0 = await bal("5203");
  const r = await move({ kind: "pay", fromId: await id("11101"), accountId: await id("5203"), amount: "1000", party: `${P} مورد البوفيه`, ref: "INV-7" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await bal("11101"), safe0 - 1_000_00);
  assert.equal(await bal("5203"), buffet0 + 1_000_00);
  assert.match(r.body.move.no, /^MV-\d+$/);
  assert.deepEqual(r.body.effect.map((e: { code: string }) => e.code).sort(), ["11101", "5203"]);
  const entry = (await call(`/finance/journal/${r.body.move.entry.id}`, { cookie: ahmed })).body;
  assert.equal(entry.debit, "1000.00");
  assert.equal(entry.credit, "1000.00");
  assert.equal(entry.nature, "إذن صرف خزنة");
  assert.equal(entry.sourceId, r.body.move.id);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "TreasuryMove", entityId: r.body.move.id, action: "create" } }));
});

test("refusals: above the balance, the same safe, a parent account, a future date (4 Nov)", async () => {
  const safe = await id("11101");
  const over = await move({ kind: "pay", fromId: safe, accountId: await id("5203"), amount: String((await bal("11101")) / 100 + 1), party: "x" });
  assert.equal(over.status, 400);
  assert.match(over.body.error, /مش كفاية/);
  assert.equal((await move({ kind: "transfer", fromId: safe, toId: safe, amount: "10" })).body.error, "اختار خزنتين مختلفتين");
  assert.equal((await move({ kind: "pay", fromId: safe, accountId: await id("52"), amount: "10", party: "x" })).status, 400);
  const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  assert.equal((await move({ kind: "pay", fromId: safe, accountId: await id("5203"), amount: "10", party: "x", date: tomorrow })).status, 400);
});

test("a 20,000 transfer from CIB to Nancy's safe; the statement shows the current balance (9.11)", async () => {
  const cib0 = await bal("11201"), nancy0 = await bal("11102");
  const r = await move({ kind: "transfer", fromId: await id("11201"), toId: await id("11102"), amount: "20000" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await bal("11201"), cib0 - 20_000_00);
  assert.equal(await bal("11102"), nancy0 + 20_000_00);
  const statement = (await call(`/finance/accounts/${await id("11102")}/ledger`, { cookie: ahmed })).body;
  assert.equal(cents(statement.balance), nancy0 + 20_000_00);
  assert.equal(cents(statement.lines.at(-1).balance), cents(statement.balance));
  const list = (await call(`/finance/moves?accountId=${await id("11102")}`, { cookie: ahmed })).body;
  assert.ok(list.items.some((m: { id: string }) => m.id === r.body.move.id));
});

test("a receipt from other revenue (42): the safe up, the revenue up (9.11)", async () => {
  const s0 = await bal("11101"), rev0 = await bal("4204");
  const r = await move({ kind: "receive", toId: await id("11101"), accountId: await id("4204"), amount: "2500", party: `${P} عميل استشارة` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await bal("11101"), s0 + 2_500_00);
  assert.equal(await bal("4204"), rev0 + 2_500_00);
  assert.equal((await move({ kind: "receive", toId: await id("11101"), accountId: await id("5203"), amount: "1", party: "x" })).status, 400); // not a revenue
});

test("an advance opens the employee's own account under 131; a custody settles spent + returned, never more (9.3)", async () => {
  const mokhtar = (await prisma.user.findUniqueOrThrow({ where: { email: "mokhtar.gamal@places.com" } })).id;
  const adv = await move({ kind: "advance", fromId: await id("11101"), partyId: mokhtar, amount: "3000" });
  assert.equal(adv.status, 201, JSON.stringify(adv.body));
  assert.match(adv.body.move.account.code, /^131\d{2}$/);
  const again = await move({ kind: "advance", fromId: await id("11101"), partyId: mokhtar, amount: "500" });
  assert.equal(again.body.move.account.id, adv.body.move.account.id); // same account, not a second one
  const cash = (await call("/finance/cash", { cookie: ahmed })).body;
  assert.equal(cents(cash.advances.find((h: { userId: string }) => h.userId === mokhtar).balance), 3_500_00);

  const cus = await move({ kind: "custody", fromId: await id("11101"), partyId: mokhtar, amount: "1000" });
  assert.equal(cus.status, 201);
  const account = cus.body.move.account.id;
  assert.match((await move({ kind: "settle", accountId: account, expenseId: await id("5203"), toId: await id("11101"), spent: "900", returned: "200" })).body.error, /أكبر من العهدة/);
  const s0 = await bal("11101");
  const ok = await move({ kind: "settle", accountId: account, expenseId: await id("5203"), toId: await id("11101"), spent: "600", returned: "400" });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(await bal("11101"), s0 + 400_00);
  assert.equal(cents(find(await chart(), cus.body.move.account.code)!.balance), 0);
});

test("the budget: «فاضل» on the line, 80% warns and notifies the accountant (9.2 / 9.9)", async () => {
  const buffet = await id("5203");
  const spent = cents((await call("/finance/budget", { cookie: ahmed })).body.rows.find((r: { code: string }) => r.code === "5203").spent);
  const patch = await call(`/finance/budget/${buffet}`, { method: "PATCH", cookie: ahmed, body: { budget: ((spent + 1_000_00) / 100).toFixed(2), period: "month", alert: 80 } });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  const cash = (await call("/finance/cash", { cookie: ahmed })).body;
  assert.equal(cents(cash.expenses.find((e: { code: string }) => e.code === "5203").left), 1_000_00);
  const r = await move({ kind: "pay", fromId: await id("11101"), accountId: buffet, amount: "850", party: `${P} بوفيه` });
  assert.equal(r.status, 201);
  assert.match(r.body.budget, /من البادجت/);
  const row = (await call("/finance/budget", { cookie: ahmed })).body.rows.find((x: { code: string }) => x.code === "5203");
  assert.equal(row.level, "warn");
  assert.ok(await prisma.notification.findFirst({ where: { text: { contains: "بوفيه" }, createdAt: { gte: START } } }));
});
