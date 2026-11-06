/**
 * The daily jobs rest on days off and lose nothing (CLAUDE.md «Time»: Friday off, official holidays, the days off set in
 * «قواعد الليدز»): a «حل الـ HR» due on a Friday, with a holiday after it, rings the next working day; a fixed bill whose
 * day is a Friday is announced the next working day; a Saturday the admin turns off rests the jobs too. Their
 * notifications carry their event (the bell's filter, 12.11). And «الالتزام بسقف العهدة» (M-08 3.1) is measured.
 * The jobs are imported and run with a clock in January 2030 (Fri 4 · Sat 5 = an E2E holiday · Sun 6).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { DEFAULT_LEAD_RULES } from "@places/domain";
import { hrActionAlarmTick } from "../../worker/src/processors/hr-action-alarm.ts";
import { recurringBillsTick } from "../../worker/src/processors/recurring-bills.ts";
import { draftAdminAlarmTick } from "../../worker/src/processors/draft-admin-alarm.ts";
import { kpiRefreshTick } from "../../worker/src/processors/kpi-refresh.ts";
import { workingDay } from "../../worker/src/calendar.ts";
import { workingNow } from "./helpers.ts";

const START = new Date();
const P = `E2E-WD ${Date.now()}`;
const at = (day: string) => new Date(`${day}T10:00:00Z`); // 12:00 in Cairo, in working hours
const FRI = at("2030-01-04"), SAT = at("2030-01-05"), SUN = at("2030-01-06");
let oneOnOneId = "", billId = "";

before(async () => {
  await prisma.holiday.create({ data: { from: new Date("2030-01-05"), to: new Date("2030-01-05"), label: `${P} إجازة` } });
});

after(async () => {
  await prisma.holiday.deleteMany({ where: { label: { startsWith: "E2E-WD" } } });
  if (oneOnOneId) await prisma.oneOnOne.deleteMany({ where: { id: oneOnOneId } });
  if (billId) await prisma.recurringBill.deleteMany({ where: { id: billId } });
  // only these jobs write these events and no other file runs them: whatever they told during this file is this file's
  const told = { createdAt: { gte: START }, event: { in: ["hr.action_due", "finance.bill_due"] } };
  await prisma.mailLog.deleteMany({ where: { notification: told } });
  await prisma.notification.deleteMany({ where: told });
  await prisma.$disconnect();
});

test("the configured calendar: Friday and an official holiday rest, a Saturday off in «قواعد الليدز» rests too", async () => {
  assert.equal(await workingDay(FRI), null);
  assert.equal(await workingDay(SAT), null, "the holiday");
  assert.equal(await workingDay(SUN), "2030-01-06");
  const satOff = { ...DEFAULT_LEAD_RULES, work: { ...DEFAULT_LEAD_RULES.work, off: [5, 6] } };
  const nextSat = at("2030-01-12");
  assert.equal(await workingDay(nextSat), "2030-01-12");
  assert.equal(await workingDay(nextSat, satOff), null);
  // the daily Draft Admin Alarm follows the rules it holds: nothing claimed on a Saturday off
  const saved = await prisma.setting.findUnique({ where: { key: "draftAdminAlarm" } });
  assert.equal(await draftAdminAlarmTick(nextSat, satOff), 0);
  assert.deepEqual((await prisma.setting.findUnique({ where: { key: "draftAdminAlarm" } }))?.value, saved?.value);
});

test("M-05 7.8: «حل الـ HR» due on a Friday rings neither Friday nor the holiday, but the next working day, with its event", async () => {
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } }, select: { id: true } });
  oneOnOneId = (await prisma.oneOnOne.create({
    data: { employeeId: emp.id, heldOn: new Date("2030-01-01"), answers: {}, hrAction: `${P} كورس`, hrActionDue: new Date("2030-01-04") },
  })).id;
  const rang = async () => (await prisma.oneOnOne.findUniqueOrThrow({ where: { id: oneOnOneId } })).alarmedAt;
  await hrActionAlarmTick(FRI);
  assert.equal(await rang(), null, "Friday");
  await hrActionAlarmTick(SAT);
  assert.equal(await rang(), null, "the holiday");
  await hrActionAlarmTick(SUN);
  assert.deepEqual(await rang(), SUN, "the next working day: not lost");
  const n = await prisma.notification.findMany({ where: { text: { contains: P }, createdAt: { gte: START } } });
  assert.ok(n.length >= 1, "HR heard");
  assert.ok(n.every((x) => x.event === "hr.action_due" && x.important));
});

test("M-07 9.16: a fixed bill whose day is a Friday is announced the next working day, once, with its event", async () => {
  const name = `${P} اشتراك`;
  billId = (await prisma.recurringBill.create({ data: { name, vendor: "Property Finder", accountId: "e2e", fromId: "e2e", amount: "4500", day: 4, createdById: "e2e" } })).id;
  const month = async () => (await prisma.recurringBill.findUniqueOrThrow({ where: { id: billId } })).notifiedFor;
  await recurringBillsTick(FRI);
  await recurringBillsTick(SAT);
  assert.equal(await month(), null, "Friday and the holiday rest");
  await recurringBillsTick(SUN);
  await recurringBillsTick(SUN);
  assert.equal(await month(), "2030-01");
  const n = await prisma.notification.findMany({ where: { text: { contains: name }, createdAt: { gte: START } } });
  assert.ok(n.length >= 1, "the accountant heard");
  assert.ok(n.every((x) => x.event === "finance.bill_due"));
  assert.equal(new Set(n.map((x) => x.userId)).size, n.length, "once each");
});

test("M-08 3.1 · M-12: «الالتزام بسقف العهدة» is measured — a safe over its ceiling makes it 0%", async () => {
  // kpis.e2e closes the quarter and opens the next for a moment; the job measures the current quarter
  for (let i = 0; i < 50; i++) {
    const q = await prisma.kpiQuarter.findFirst({ orderBy: { id: "desc" } });
    if (q?.id === "2026-Q4" && q.status === "open") break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const item = await prisma.kpiItem.findFirstOrThrow({ where: { metric: "pettyCap", card: { quarter: "2026-Q4" } }, select: { id: true, value: true, card: { select: { employeeId: true } } } });
  const bank = await prisma.account.findFirstOrThrow({ where: { kind: "bank", archivedAt: null }, orderBy: { code: "desc" }, select: { id: true, cap: true } });
  const day = await workingNow();
  try {
    // a ceiling no balance can be under: whatever the other safes hold, one over its ceiling is enough
    await prisma.account.update({ where: { id: bank.id }, data: { cap: "-99999999.00" } });
    await kpiRefreshTick(day, [item.card.employeeId]);
    assert.equal(String((await prisma.kpiItem.findUniqueOrThrow({ where: { id: item.id } })).value), "0"); // measured, not «لسه» (null)
  } finally {
    await prisma.account.update({ where: { id: bank.id }, data: { cap: bank.cap } });
    await prisma.kpiItem.update({ where: { id: item.id }, data: { value: item.value } });
    // only the refresh lines that wrote this item: kpi-job / kpi-ops check their own at the same time
    await prisma.auditLog.deleteMany({ where: { module: "kpis", entity: "KpiItem", action: "refresh", at: { gte: START }, after: { path: ["items"], array_contains: [{ id: item.id }] } } });
  }
});
