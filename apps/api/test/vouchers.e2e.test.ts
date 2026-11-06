/**
 * 9.2 · 9.3 · 9.11 · treasury vouchers and the budget (M-07, the accountant's meeting 4 Nov) against the real API:
 * a 1,000 payment for the buffet from the main safe moves both balances with a balanced entry; a 20,000 transfer from
 * the bank to Nancy's safe; no payment above the balance or to the same safe; an advance opens the employee's own
 * account under 131; a custody settles (spent + returned) and can't settle more than it holds; the budget warns at 80%.
 * The file opens its own safes / lines (finance files run in parallel). Ahmed Ashraf = accountant, Mohamed Mohsen = sales.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { balance, chart, cleanFinance, find, fresh } from "./finance-helpers.ts";

const START = new Date();
const P = `E2E ${START.getTime()}`;
let ahmed: string, sales: string, admin: string;
let safe: { id: string }, bank: { id: string }, nancy: { id: string }, buffet: { id: string; code: string }, revenue: { id: string };
const move = async (body: Record<string, unknown>, cookie = ahmed) => call("/finance/moves", { method: "POST", cookie, body: { memo: `${P} حركة`, ...body } });
const bal = (id: string) => balance(ahmed, id);

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [ahmed, sales, admin] = await Promise.all(["ahmed.ashraf@places.com", "m.mohsen@places.com", adminEmail].map((e) => session(e)));
  safe = await fresh(ahmed, P, "111", "خزينة رئيسية", "50000");
  nancy = await fresh(ahmed, P, "111", "خزينة نانسي");
  bank = await fresh(ahmed, P, "112", "بنك", "30000");
  buffet = await fresh(ahmed, P, "52", "بوفيه");
  revenue = await fresh(ahmed, P, "42", "استشارات عقارية");
});
after(async () => { await cleanFinance(P, START, true); await prisma.$disconnect(); });

test("only finance: sales get 403, the admin views but can't post", async () => {
  assert.equal((await call("/finance/cash", { cookie: sales })).status, 403);
  assert.equal((await call("/finance/moves", { cookie: sales })).status, 403);
  assert.equal((await call("/finance/cash", { cookie: admin })).status, 200);
  assert.equal((await move({ kind: "pay", fromId: safe.id, accountId: buffet.id, amount: "10", party: "x" }, admin)).status, 403);
  assert.equal((await call(`/finance/budget/${buffet.id}`, { method: "PATCH", cookie: sales, body: { budget: "100" } })).status, 403);
});

test("a 1,000 payment for the buffet from the main safe: safe −1,000, buffet +1,000, a balanced entry, the effect (9.2)", async () => {
  const safe0 = await bal(safe.id), buffet0 = await bal(buffet.id);
  const r = await move({ kind: "pay", fromId: safe.id, accountId: buffet.id, amount: "1000", party: `${P} مورد البوفيه`, ref: "INV-7" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await bal(safe.id), safe0 - 1_000_00);
  assert.equal(await bal(buffet.id), buffet0 + 1_000_00);
  assert.match(r.body.move.no, /^MV-\d+$/);
  assert.equal(r.body.effect.length, 2);
  const entry = (await call(`/finance/journal/${r.body.move.entry.id}`, { cookie: ahmed })).body;
  assert.equal(entry.debit, "1000.00");
  assert.equal(entry.credit, "1000.00");
  assert.equal(entry.nature, "إذن صرف خزنة");
  assert.equal(entry.sourceId, r.body.move.id);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "TreasuryMove", entityId: r.body.move.id, action: "create" } }));
});

test("payments at the same moment can't overdraw a safe: they wait for each other and the rest are refused", async () => {
  const small = await fresh(ahmed, P, "111", "خزينة صغيرة", "1000");
  assert.equal((await move({ kind: "pay", fromId: small.id, accountId: buffet.id, amount: "600", party: "x" }, sales)).status, 403);
  const all = await Promise.all(Array.from({ length: 5 }, () => move({ kind: "pay", fromId: small.id, accountId: buffet.id, amount: "600", party: `${P} مورد` })));
  assert.deepEqual(all.map((r) => r.status).sort(), [201, 400, 400, 400, 400]);
  assert.equal(await bal(small.id), 400_00);
});

test("refusals: above the balance, the same safe, a parent account, a future date (4 Nov)", async () => {
  const over = await move({ kind: "pay", fromId: safe.id, accountId: buffet.id, amount: String((await bal(safe.id)) / 100 + 1), party: "x" });
  assert.equal(over.status, 400);
  assert.match(over.body.error, /مش كفاية/);
  assert.equal((await move({ kind: "transfer", fromId: safe.id, toId: safe.id, amount: "10" })).body.error, "اختار خزنتين مختلفتين");
  assert.equal((await move({ kind: "pay", fromId: safe.id, accountId: find(await chart(ahmed), "52")!.id, amount: "10", party: "x" })).status, 400);
  const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  assert.equal((await move({ kind: "pay", fromId: safe.id, accountId: buffet.id, amount: "10", party: "x", date: tomorrow })).status, 400);
});

test("a 20,000 transfer from the bank to Nancy's safe; the statement shows the current balance (9.11)", async () => {
  const r = await move({ kind: "transfer", fromId: bank.id, toId: nancy.id, amount: "20000" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await bal(bank.id), 10_000_00);
  assert.equal(await bal(nancy.id), 20_000_00);
  const statement = (await call(`/finance/accounts/${nancy.id}/ledger`, { cookie: ahmed })).body;
  assert.equal(statement.balance, "20000.00");
  assert.equal(statement.lines.at(-1).balance, "20000.00");
  const list = (await call(`/finance/moves?accountId=${nancy.id}`, { cookie: ahmed })).body;
  assert.ok(list.items.some((m: { id: string }) => m.id === r.body.move.id));
});

test("a receipt from other revenue (42): the safe up, the revenue up (9.11)", async () => {
  const s0 = await bal(safe.id);
  const r = await move({ kind: "receive", toId: safe.id, accountId: revenue.id, amount: "2500", party: `${P} عميل استشارة` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await bal(safe.id), s0 + 2_500_00);
  assert.equal(await bal(revenue.id), 2_500_00);
  assert.equal((await move({ kind: "receive", toId: safe.id, accountId: buffet.id, amount: "1", party: "x" })).status, 400); // not a revenue
});

test("an advance opens the employee's own account under 131; a custody settles spent + returned, never more (9.3)", async () => {
  const mokhtar = (await prisma.user.findUniqueOrThrow({ where: { email: "mokhtar.gamal@places.com" } })).id;
  const adv = await move({ kind: "advance", fromId: safe.id, partyId: mokhtar, amount: "3000" });
  assert.equal(adv.status, 201, JSON.stringify(adv.body));
  assert.match(adv.body.move.account.code, /^131\d{2}$/);
  const again = await move({ kind: "advance", fromId: safe.id, partyId: mokhtar, amount: "500" });
  assert.equal(again.body.move.account.id, adv.body.move.account.id); // same account, not a second one
  assert.equal(await bal(adv.body.move.account.id), 3_500_00);

  const cus = await move({ kind: "custody", fromId: safe.id, partyId: mokhtar, amount: "1000" });
  assert.equal(cus.status, 201);
  const account = cus.body.move.account.id;
  assert.match((await move({ kind: "settle", accountId: account, expenseId: buffet.id, toId: safe.id, spent: "900", returned: "200" })).body.error, /أكبر من العهدة/);
  const s0 = await bal(safe.id);
  const ok = await move({ kind: "settle", accountId: account, expenseId: buffet.id, toId: safe.id, spent: "600", returned: "400" });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(await bal(safe.id), s0 + 400_00);
  assert.equal(await bal(account), 0);
});

test("the budget: «فاضل» on the line, 80% warns and notifies the accountant (9.2 / 9.9)", async () => {
  const spent = (await bal(buffet.id));
  const patch = await call(`/finance/budget/${buffet.id}`, { method: "PATCH", cookie: ahmed, body: { budget: ((spent + 1_000_00) / 100).toFixed(2), period: "month", alert: 80 } });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  const cash = (await call("/finance/cash", { cookie: ahmed })).body;
  assert.equal(cash.expenses.find((e: { id: string }) => e.id === buffet.id).left, "1000.00");
  const r = await move({ kind: "pay", fromId: safe.id, accountId: buffet.id, amount: "850", party: `${P} بوفيه` });
  assert.equal(r.status, 201);
  assert.match(r.body.budget, /من البادجت/);
  const row = (await call("/finance/budget", { cookie: ahmed })).body.rows.find((x: { accountId: string }) => x.accountId === buffet.id);
  assert.equal(row.level, "warn");
  assert.ok(await prisma.notification.findFirst({ where: { text: { contains: P }, createdAt: { gte: START } } }));
});
