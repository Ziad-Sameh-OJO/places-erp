/**
 * «خطة التارجت» (management, 25 Nov) against the real API and database: a year of every salesperson's monthly targets,
 * many cells saved at once, one metric at a time; a closed month is skipped; the other two metrics stay as they were.
 * Done in a far year (2099) so no other test's month is touched.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import type { TargetPlan, TargetPlanResult } from "@places/contracts";
import { call, session } from "./helpers.ts";

const YEAR = 2099;
let admin: string, sales: string, mohsenId: string, amrId: string;
const since = new Date();

before(async () => {
  [admin, sales] = await Promise.all(["ahmed.islam@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const emp = (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } }, select: { id: true } }).then((e) => e.id);
  [mohsenId, amrId] = await Promise.all([emp("m.mohsen@places.com"), emp("ahmed.amr@places.com")]);
});
after(async () => {
  await prisma.salesTarget.deleteMany({ where: { month: { startsWith: `${YEAR}-` }, employeeId: { in: [mohsenId, amrId] } } });
  await prisma.auditLog.deleteMany({ where: { entity: "SalesTarget", at: { gte: since }, OR: [mohsenId, amrId].map((id) => ({ entityId: { startsWith: `${id}:${YEAR}` } })) } });
  await prisma.$disconnect();
});

const save = (cookie: string, body: unknown) => call("/reports/targets/plan", { method: "PUT", cookie, body });

test("the plan: twelve open months of a coming year; nothing saved yet shows the standing target", async () => {
  const r = await call(`/reports/targets/plan?year=${YEAR}`, { cookie: admin });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = r.body as TargetPlan;
  assert.equal(p.months.length, 12);
  assert.ok(p.months.every((m) => m.lock === "open"));
  const m = p.people.find((x) => x.employeeId === mohsenId)!;
  assert.equal(m.cells[`${YEAR}-01`]!.saved, false);
  const standing = await prisma.employee.findUniqueOrThrow({ where: { id: mohsenId }, select: { target: true } });
  assert.equal(m.cells[`${YEAR}-01`]!.value, standing.target.toFixed(2));
  assert.equal((await call(`/reports/targets/plan?year=${YEAR}`, { cookie: sales })).status, 403);
  assert.equal((await call("/reports/targets/plan?year=1999", { cookie: admin })).status, 400);
});

test("many cells at once, one metric; the other two stay; a closed month is skipped, not refused", async () => {
  const r = await save(admin, { metric: "value", cells: [
    { employeeId: mohsenId, month: `${YEAR}-01`, amount: "100000" }, { employeeId: mohsenId, month: `${YEAR}-02`, amount: "100000.50" },
    { employeeId: amrId, month: `${YEAR}-01`, amount: "80000" }, { employeeId: amrId, month: "2025-01", amount: "1" },
  ] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body as TargetPlanResult, { saved: 3, pending: 0, skipped: 1 });
  assert.equal((await save(admin, { metric: "deals", cells: [{ employeeId: mohsenId, month: `${YEAR}-01`, amount: "4" }] })).status, 200);
  const row = await prisma.salesTarget.findUniqueOrThrow({ where: { employeeId_month: { employeeId: mohsenId, month: `${YEAR}-01` } } });
  assert.deepEqual([row.value.toFixed(2), row.deals, row.visits], ["100000.00", 4, 0]); // deals changed, value kept
  const p = (await call(`/reports/targets/plan?year=${YEAR}`, { cookie: admin })).body as TargetPlan;
  const m = p.people.find((x) => x.employeeId === mohsenId)!;
  assert.deepEqual([m.cells[`${YEAR}-02`]!.value, m.cells[`${YEAR}-02`]!.saved], ["100000.50", true]);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "SalesTarget", entityId: `${mohsenId}:${YEAR}-01`, at: { gte: since } } }));
});

test("refused: a count that isn't whole, a negative or wordy amount, sales saving, someone out of scope", async () => {
  assert.equal((await save(admin, { metric: "deals", cells: [{ employeeId: mohsenId, month: `${YEAR}-03`, amount: "2.5" }] })).status, 400);
  assert.equal((await save(admin, { metric: "value", cells: [{ employeeId: mohsenId, month: `${YEAR}-03`, amount: "-5" }] })).status, 400);
  assert.equal((await save(admin, { metric: "value", cells: [] })).status, 400);
  assert.equal((await save(sales, { metric: "value", cells: [{ employeeId: mohsenId, month: `${YEAR}-03`, amount: "5" }] })).status, 403);
  assert.equal((await save(admin, { metric: "value", cells: [{ employeeId: "nobody", month: `${YEAR}-03`, amount: "5" }] })).status, 404);
});
