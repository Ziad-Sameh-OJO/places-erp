/**
 * 9.16 · recurring bills and 9.9 · the budget page (M-07, the accountant's meeting 4 Nov): a bill never pays by itself;
 * «وافق واصرف» is a payment voucher marked paid for the month (a second one is refused), «مش الشهر ده» keeps the reason;
 * a new budget line opens a sub-account under 52 with its budget and owner; the budget exports to Excel.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { cleanFinance, fresh, runPrefix } from "./finance-helpers.ts";

const P = runPrefix("bills");
const START = new Date();
let ahmed: string, sales: string, admin: string;
let bank: { id: string }, line: { id: string };
const bill = async (name: string, day: number, cookie = ahmed) => call("/finance/bills", { method: "POST", cookie, body: { name: `${P} ${name}`, vendor: "Property Finder", accountId: line.id, fromId: bank.id, amount: "4500", day } });

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [ahmed, sales, admin] = await Promise.all(["ahmed.ashraf@places.com", "m.mohsen@places.com", adminEmail].map((e) => session(e)));
  bank = await fresh(ahmed, P, "112", "بنك", "20000");
  line = await fresh(ahmed, P, "5317", "بروبيرتي فايندر");
});
after(async () => { await cleanFinance(P, START); await prisma.$disconnect(); });

test("only finance: sales 403 on bills; the admin views but can't add", async () => {
  assert.equal((await call("/finance/bills", { cookie: sales })).status, 403);
  assert.equal((await call("/finance/bills", { cookie: admin })).status, 200);
  assert.equal((await bill("ممنوع", 1, admin)).status, 403);
});

test("a bill due today: «وافق واصرف» posts a voucher and marks the month paid; never twice (9.16)", async () => {
  const r = await bill("اشتراك Property Finder", 1);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  let list = (await call("/finance/bills", { cookie: ahmed })).body;
  let b = list.items.find((x: { id: string }) => x.id === r.body.id);
  assert.equal(b.state, "due"); // day 1 ≤ any day of the month
  const pay = { kind: "pay", billId: b.id, fromId: b.from.id, accountId: b.account.id, amount: "4600", party: b.vendor, memo: `${b.name} · ${list.label}` };
  const paid = await call("/finance/moves", { method: "POST", cookie: ahmed, body: pay });
  assert.equal(paid.status, 201, JSON.stringify(paid.body));
  list = (await call("/finance/bills", { cookie: ahmed })).body;
  b = list.items.find((x: { id: string }) => x.id === r.body.id);
  assert.equal(b.state, "paid");
  assert.equal(b.move.no, paid.body.move.no);
  const again = await call("/finance/moves", { method: "POST", cookie: ahmed, body: pay });
  assert.equal(again.status, 400);
  assert.equal(again.body.error, "الفاتورة دي اتصرفت الشهر ده");
});

test("«مش الشهر ده» keeps the reason; stop / start (9.16)", async () => {
  const r = await bill("إنترنت", 1);
  assert.equal((await call(`/finance/bills/${r.body.id}/skip`, { method: "POST", cookie: ahmed, body: { reason: "اتدفعت مع الشهر اللي فات" } })).status, 201);
  const b = (await call("/finance/bills", { cookie: ahmed })).body.items.find((x: { id: string }) => x.id === r.body.id);
  assert.equal(b.state, "skipped");
  assert.equal(b.reason, "اتدفعت مع الشهر اللي فات");
  assert.equal((await call(`/finance/bills/${r.body.id}`, { method: "PATCH", cookie: ahmed, body: { active: false } })).status, 200);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "RecurringBill", entityId: r.body.id, action: "skip" } }));
});

test("a new budget line opens a sub-account under 52 with its budget and owner; export (9.9)", async () => {
  const nancy = (await prisma.user.findUniqueOrThrow({ where: { email: "nancy.islam@places.com" } })).id;
  const r = await call("/finance/budget", { method: "POST", cookie: ahmed, body: { parent: "52", name: `${P} صيانة التكييفات`, budget: "3000", period: "quarter", alert: 70, ownerId: nancy } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const row = (await call("/finance/budget", { cookie: ahmed })).body.rows.find((x: { accountId: string }) => x.accountId === r.body.accountId);
  assert.match(row.code, /^52\d{2}$/);
  assert.equal(row.budget, "3000.00");
  assert.equal(row.period, "quarter");
  assert.equal(row.owner.userId, nancy);
  assert.equal((await call("/finance/budget", { method: "POST", cookie: sales, body: { parent: "52", name: "x", budget: "1" } })).status, 403);
  const x = await fetch(`${process.env.API_URL ?? "http://localhost:4000"}/api/v1/finance/budget/export`, { headers: { cookie: ahmed } });
  assert.equal(x.status, 200);
  assert.match(x.headers.get("content-type") ?? "", /spreadsheetml/);
  assert.equal((await call("/finance/budget/export", { cookie: sales })).status, 403);
});
