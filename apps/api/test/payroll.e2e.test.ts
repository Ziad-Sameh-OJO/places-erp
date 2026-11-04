/**
 * 9.14 · payroll (M-07, the accountant's meeting 4 Nov) with 9.3's monthly advance deduction: the accountant picks how
 * much of an advance comes off this month; «اصرف المرتبات كلها» posts one voucher with one balanced entry
 * (5202 / 5301 → the person's 131xx + the bank); once a month; every employee hears their net.
 * The run is removed afterwards (one run per month), and the two salaries are put back.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { balance, cleanFinance, fresh } from "./finance-helpers.ts";

const START = new Date();
const P = `E2E ${START.getTime()}`;
const month = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).slice(0, 7);
let ahmed: string, sales: string, admin: string;
let bank: { id: string }, safe: { id: string };
let mokhtar: { id: string; userId: string; salary: unknown }, mohsen: { id: string; userId: string; salary: unknown };

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [ahmed, sales, admin] = await Promise.all(["ahmed.ashraf@places.com", "m.mohsen@places.com", adminEmail].map((e) => session(e)));
  mokhtar = await prisma.employee.findFirstOrThrow({ where: { user: { email: "mokhtar.gamal@places.com" } }, select: { id: true, userId: true, salary: true } });
  mohsen = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } }, select: { id: true, userId: true, salary: true } });
  await prisma.employee.update({ where: { id: mokhtar.id }, data: { salary: "12000" } });
  await prisma.employee.update({ where: { id: mohsen.id }, data: { salary: "8000" } });
  bank = await fresh(ahmed, P, "112", "بنك المرتبات", "500000");
  safe = await fresh(ahmed, P, "111", "خزينة", "10000");
});
after(async () => {
  const run = await prisma.payrollRun.findUnique({ where: { month } });
  if (run) {
    const move = await prisma.treasuryMove.findUnique({ where: { id: run.moveId } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [run.id, run.moveId, move?.entryId ?? ""] } } });
    await prisma.payrollRun.delete({ where: { id: run.id } });
    await prisma.treasuryMove.delete({ where: { id: run.moveId } });
    if (move) await prisma.journalEntry.delete({ where: { id: move.entryId } });
  }
  await prisma.advanceDeduction.deleteMany({ where: { userId: { in: [mokhtar.userId, mohsen.userId] }, month } });
  await prisma.auditLog.deleteMany({ where: { entity: "AdvanceDeduction", at: { gte: START } } });
  await prisma.notification.deleteMany({ where: { text: { startsWith: "اتصرف مرتب" }, createdAt: { gte: START } } });
  await prisma.employee.update({ where: { id: mokhtar.id }, data: { salary: mokhtar.salary as never } });
  await prisma.employee.update({ where: { id: mohsen.id }, data: { salary: mohsen.salary as never } });
  await cleanFinance(P, START, true);
  await prisma.$disconnect();
});

test("only finance: sales 403 on payroll; the admin views but can't pay", async () => {
  assert.equal((await call("/finance/payroll", { cookie: sales })).status, 403);
  assert.equal((await call("/finance/payroll", { cookie: admin })).status, 200);
  assert.equal((await call("/finance/payroll/run", { method: "POST", cookie: admin, body: { fromId: bank.id } })).status, 403);
});

test("the advance deduction: default = all that's left, the accountant picks 1,000, never more than what's left (9.3)", async () => {
  const adv = await call("/finance/moves", { method: "POST", cookie: ahmed, body: { kind: "advance", fromId: safe.id, partyId: mohsen.userId, amount: "3000", memo: `${P} سلفة` } });
  assert.equal(adv.status, 201, JSON.stringify(adv.body));
  let row = (await call("/finance/payroll", { cookie: ahmed })).body.rows.find((r: { userId: string }) => r.userId === mohsen.userId);
  assert.equal(row.advance, "3000.00");
  assert.equal((await call(`/finance/payroll/advances/${mohsen.userId}`, { method: "PUT", cookie: ahmed, body: { amount: "5000" } })).status, 400);
  assert.equal((await call(`/finance/payroll/advances/${mohsen.userId}`, { method: "PUT", cookie: ahmed, body: { amount: "1000" } })).status, 200);
  row = (await call("/finance/payroll", { cookie: ahmed })).body.rows.find((r: { userId: string }) => r.userId === mohsen.userId);
  assert.equal(row.advance, "1000.00");
  assert.equal(row.net, "7000.00");
  assert.equal(row.line, "sales");
});

test("«اصرف المرتبات كلها»: one voucher, one balanced entry; once a month; everyone notified (9.14)", async () => {
  const view = (await call("/finance/payroll", { cookie: ahmed })).body;
  const bank0 = await balance(ahmed, bank.id);
  const r = await call("/finance/payroll/run", { method: "POST", cookie: ahmed, body: { fromId: bank.id } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await balance(ahmed, bank.id), bank0 - Math.round(Number(view.totals.net) * 100));
  const entry = (await call(`/finance/journal/${r.body.entry.id}`, { cookie: ahmed })).body;
  assert.equal(entry.debit, entry.credit);
  assert.equal(entry.nature, "صرف مرتبات");
  assert.ok(Number(entry.lines.find((l: { code: string }) => l.code === "5301").debit) >= 8000);
  assert.ok(Number(entry.lines.find((l: { code: string }) => l.code === "5202").debit) >= 12000);
  const advAccount = view.rows.find((x: { userId: string }) => x.userId === mohsen.userId).advanceAccountId;
  assert.equal(entry.lines.find((l: { accountId: string }) => l.accountId === advAccount).credit, "1000.00");
  assert.equal(await balance(ahmed, advAccount), 2_000_00);
  const again = await call("/finance/payroll/run", { method: "POST", cookie: ahmed, body: { fromId: bank.id } });
  assert.equal(again.status, 400);
  assert.equal(again.body.error, "مرتبات الشهر ده اتصرفت قبل كده");
  const after = (await call("/finance/payroll", { cookie: ahmed })).body;
  assert.equal(after.run.move.no, r.body.move.no);
  assert.ok(await prisma.notification.findFirst({ where: { userId: mohsen.userId, text: { contains: "باقي عليك" }, createdAt: { gte: START } } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "PayrollRun", entityId: r.body.id } }));
});
