/**
 * 9.14 · payroll (M-07, the accountant's meeting 4 Nov) with 9.3's monthly advance deduction: the accountant picks how
 * much of an advance comes off this month; «اصرف المرتبات كلها» posts one voucher with one balanced entry
 * (5202 / 5301 → the person's 131xx + the bank); once a month; every employee hears their net.
 * 7.9: HR approves the month's deductions (attendance + approved penalties) once; payroll reads exactly those numbers.
 * The run and the approval are removed afterwards (one per month), and the two salaries are put back.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { balance, cleanFinance, fresh, runPrefix } from "./finance-helpers.ts";

const START = new Date();
const P = runPrefix("payroll");
const month = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).slice(0, 7);
let ahmed: string, sales: string, admin: string, basant: string, tl: string;
let bank: { id: string }, safe: { id: string };
let mokhtar: { id: string; userId: string; salary: unknown }, mohsen: { id: string; userId: string; salary: unknown };

/** The month's run with its voucher and entry (one per month: a leftover would refuse «اصرف المرتبات كلها»). */
async function dropRun() {
  const run = await prisma.payrollRun.findUnique({ where: { month } });
  if (!run) return;
  const move = await prisma.treasuryMove.findUnique({ where: { id: run.moveId } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [run.id, run.moveId, move?.entryId ?? ""] } } });
  await prisma.payrollRun.delete({ where: { id: run.id } });
  await prisma.treasuryMove.delete({ where: { id: run.moveId } });
  if (move) await prisma.journalEntry.deleteMany({ where: { id: move.entryId } });
}

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [ahmed, sales, admin, basant, tl] = await Promise.all(["ahmed.ashraf@places.com", "m.mohsen@places.com", adminEmail, "basant.elsawy@places.com", "abdallah.sleem@places.com"].map((e) => session(e)));
  mokhtar = await prisma.employee.findFirstOrThrow({ where: { user: { email: "mokhtar.gamal@places.com" } }, select: { id: true, userId: true, salary: true } });
  mohsen = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } }, select: { id: true, userId: true, salary: true } });
  // what an interrupted run (or a manual check) left: this month's run and approval, Mohsen's advance account
  await dropRun();
  await prisma.deductionApproval.deleteMany({ where: { month } });
  await prisma.advanceDeduction.deleteMany({ where: { userId: { in: [mokhtar.userId, mohsen.userId] }, month } });
  await cleanFinance("E2E payroll ", new Date(0), [mohsen.userId]);
  await prisma.employee.update({ where: { id: mokhtar.id }, data: { salary: "12000" } });
  await prisma.employee.update({ where: { id: mohsen.id }, data: { salary: "8000" } });
  bank = await fresh(ahmed, P, "112", "بنك المرتبات", "500000");
  safe = await fresh(ahmed, P, "111", "خزينة", "10000");
});
after(async () => {
  await dropRun();
  const ok = await prisma.deductionApproval.findUnique({ where: { month } });
  if (ok) { await prisma.auditLog.deleteMany({ where: { entityId: ok.id } }); await prisma.deductionApproval.delete({ where: { id: ok.id } }); }
  const pens = await prisma.penalty.findMany({ where: { text: { startsWith: P } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: pens.map((x) => x.id) } } });
  await prisma.penalty.deleteMany({ where: { text: { startsWith: P } } });
  await prisma.notification.deleteMany({ where: { text: { startsWith: "الـ HR اعتمدت خصومات" }, createdAt: { gte: START } } });
  await prisma.advanceDeduction.deleteMany({ where: { userId: { in: [mokhtar.userId, mohsen.userId] }, month } });
  await prisma.auditLog.deleteMany({ where: { entity: "AdvanceDeduction", at: { gte: START } } });
  await prisma.notification.deleteMany({ where: { text: { startsWith: "اتصرف مرتب" }, createdAt: { gte: START } } });
  await prisma.employee.update({ where: { id: mokhtar.id }, data: { salary: mokhtar.salary as never } });
  await prisma.employee.update({ where: { id: mohsen.id }, data: { salary: mohsen.salary as never } });
  await cleanFinance(P, START, [mohsen.userId]);
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

test("7.9: HR approves the month's deductions once; payroll reads exactly those; a TL, the admin and sales can't approve", async () => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const before = (await call("/finance/payroll", { cookie: ahmed })).body;
  assert.equal(before.deductionsApproved, false);
  assert.ok(before.rows.every((r: { attendance: string }) => r.attendance === "0.00")); // nothing until HR approves
  // an approved one-day penalty on Mokhtar (12,000 → 461.54 a day) joins his line
  assert.equal((await call("/hr/penalties", { method: "POST", cookie: basant, body: { employeeId: mokhtar.id, day: today, text: `${P} جزاء`, deductionDays: 1 } })).status, 201);
  const live = (await call("/hr/deductions", { cookie: basant })).body;
  const line = live.rows.find((r: { employeeId: string }) => r.employeeId === mokhtar.id);
  assert.ok(line.penaltyDays >= 1);
  // (+ a closed KPI quarter's amount, 11.6: the KPI test may close one meanwhile)
  assert.equal(Math.round(Number(line.amount) * 100), Math.min(12_000_00, Math.min(12_000_00, Math.round((12_000_00 / 26) * (line.attendanceDays + line.penaltyDays))) - Math.round(Number(line.kpi) * 100)));
  assert.equal(live.approved, null);

  for (const cookie of [tl, admin, sales]) assert.equal((await call("/hr/deductions/approve", { method: "POST", cookie })).status, 403);
  const r = await call("/hr/deductions/approve", { method: "POST", cookie: basant });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.approved.by);
  assert.equal((await call("/hr/deductions/approve", { method: "POST", cookie: basant })).body.error, "خصومات الشهر ده اتعتمدت قبل كده");

  // frozen: a penalty after the approval doesn't change what was approved
  await call("/hr/penalties", { method: "POST", cookie: basant, body: { employeeId: mokhtar.id, day: today, text: `${P} بعد الاعتماد`, deductionDays: 1 } });
  const approved = (await call("/hr/deductions", { cookie: basant })).body.rows.find((x: { employeeId: string }) => x.employeeId === mokhtar.id);
  const pay = (await call("/finance/payroll", { cookie: ahmed })).body;
  assert.equal(pay.deductionsApproved, true);
  const row = pay.rows.find((x: { userId: string }) => x.userId === mokhtar.userId);
  assert.equal(row.attendance, approved.amount);
  assert.equal(Math.round(Number(row.net) * 100), 12_000_00 - Math.round(Number(approved.amount) * 100) - Math.round(Number(row.advance) * 100));
  const ok = await prisma.deductionApproval.findUniqueOrThrow({ where: { month } });
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "DeductionApproval", entityId: ok.id, action: "approve" } }));
});

test("«اصرف المرتبات كلها»: one voucher, one balanced entry; once a month; everyone notified (9.14)", async () => {
  const view = (await call("/finance/payroll", { cookie: ahmed })).body;
  const bank0 = await balance(ahmed, bank.id);
  const r = await call("/finance/payroll/run", { method: "POST", cookie: ahmed, body: { fromId: bank.id } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // the run's own net, not the view's: the KPI file gives Youssef a salary for a moment, and may do it in between
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { month } });
  assert.equal(await balance(ahmed, bank.id), bank0 - Math.round(Number(run.net) * 100));
  const entry = (await call(`/finance/journal/${r.body.entry.id}`, { cookie: ahmed })).body;
  assert.equal(entry.debit, entry.credit);
  assert.equal(entry.nature, "صرف مرتبات");
  // the expense is what was earned: salary − the deductions HR approved (7.9)
  const earned = (id: string) => { const x = view.rows.find((r: { userId: string }) => r.userId === id); return Number(x.salary) - Number(x.attendance); };
  assert.ok(Number(entry.lines.find((l: { code: string }) => l.code === "5301").debit) >= earned(mohsen.userId));
  assert.ok(Number(entry.lines.find((l: { code: string }) => l.code === "5202").debit) >= earned(mokhtar.userId));
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
