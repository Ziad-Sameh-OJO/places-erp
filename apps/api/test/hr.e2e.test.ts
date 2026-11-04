/**
 * 7.1 · the employee file (M-05 3.1): HR (Basant) reads and edits salary, target, scheme, part-time and its deductions,
 * per-person tiers and a fixed schedule; every change is audited with old and new values (Q50). The Super Admin views
 * but can't edit HR data (Q49). A Team Leader sees only his team; sales get 403.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

let basant: string, admin: string, tl: string, sales: string;
let target: { id: string; salary: unknown; target: unknown; commissionPct: unknown; partTime: boolean; partTimeDeductions: boolean; deductionTiers: unknown; fixedSchedule: string | null; leaveBalance: number; joinedAt: Date | null };
const START = new Date();

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [basant, admin, tl, sales] = await Promise.all(["basant.elsawy@places.com", adminEmail, "mahmoud.ali@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  target = await prisma.employee.findFirstOrThrow({ where: { user: { email: "mokhtar.gamal@places.com" } } });
});
after(async () => {
  // put Mokhtar's file back as it was
  const { id, ...data } = target;
  await prisma.employee.update({ where: { id }, data: { ...data, deductionTiers: (data.deductionTiers ?? undefined) as never } });
  await prisma.auditLog.deleteMany({ where: { entity: "Employee", entityId: id, at: { gte: START } } });
  await prisma.$disconnect();
});

test("HR lists everyone, a TL only his team, sales 403 (M-09 2.7 scope)", async () => {
  const all = (await call("/hr/employees", { cookie: basant })).body;
  assert.ok(all.items.length > 20);
  assert.ok(all.departments.length > 3);
  const team = (await call("/hr/employees", { cookie: tl })).body;
  assert.ok(team.items.length >= 1 && team.items.length < all.items.length);
  assert.equal((await call("/hr/employees", { cookie: sales })).status, 403);
  assert.ok((await call("/hr/employees?q=مختار", { cookie: basant })).body.items.some((e: { id: string }) => e.id === target.id));
});

test("HR edits the file: salary, part-time without deductions, custom tiers, a fixed schedule; audited old → new", async () => {
  const body = { salary: "12500", target: "0", commissionPct: 0, partTime: true, partTimeDeductions: false, deductionTiers: { quarterFrom: 31, halfFrom: 61, dayFrom: 121 }, fixedSchedule: "الاتنين والخميس 17:00–19:00", leaveBalance: 21 };
  const r = await call(`/hr/employees/${target.id}`, { method: "PATCH", cookie: basant, body });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.salary, "12500.00");
  assert.equal(r.body.partTime, true);
  assert.deepEqual(r.body.deductionTiers, { quarterFrom: 31, halfFrom: 61, dayFrom: 121 });
  const file = (await call(`/hr/employees/${target.id}`, { cookie: basant })).body;
  assert.equal(file.fixedSchedule, "الاتنين والخميس 17:00–19:00");
  const log = await prisma.auditLog.findFirst({ where: { entity: "Employee", entityId: target.id, action: "update", at: { gte: START } }, orderBy: { at: "desc" } });
  assert.ok(log);
  assert.equal((log.after as { salary: string }).salary, "12500.00");
  // back to the company tiers
  const back = await call(`/hr/employees/${target.id}`, { method: "PATCH", cookie: basant, body: { salary: "12500", deductionTiers: null } });
  assert.equal(back.body.deductionTiers, null);
});

test("refusals: tiers out of order, a negative salary; the Super Admin and a TL can't edit (Q49)", async () => {
  assert.equal((await call(`/hr/employees/${target.id}`, { method: "PATCH", cookie: basant, body: { salary: "1000", deductionTiers: { quarterFrom: 40, halfFrom: 30, dayFrom: 60 } } })).status, 400);
  assert.equal((await call(`/hr/employees/${target.id}`, { method: "PATCH", cookie: basant, body: { salary: "-5" } })).status, 400);
  assert.equal((await call(`/hr/employees/${target.id}`, { cookie: admin })).status, 200); // views
  assert.equal((await call(`/hr/employees/${target.id}`, { method: "PATCH", cookie: admin, body: { salary: "1" } })).status, 403);
  assert.equal((await call(`/hr/employees/${target.id}`, { method: "PATCH", cookie: tl, body: { salary: "1" } })).status, 403);
});
