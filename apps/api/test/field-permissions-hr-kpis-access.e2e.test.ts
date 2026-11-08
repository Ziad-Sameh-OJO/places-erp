/**
 * M-09 field permissions on HR, the KPIs and the accounts, against the real API: a hidden field never leaves the API
 * (list, file, export), a search on it is dropped, a save keeps what the person may not change, a new account starts it
 * empty. Its own role and person, so the seeded roles stay as they are. Ahmed Islam = Super Admin.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { API, PW, call, session } from "./helpers.ts";

const stamp = Date.now();
const KEY = `e2e-fields-hka-${stamp}`;
const NAME = `E2E حقول ${stamp}`;
const PHONE = `0100${String(stamp).slice(-7)}`;
let admin: string, person: string, roleId: string, userId: string, staffId: string, employeeId: string, madeId = "";

before(async () => {
  admin = await session("ahmed.islam@places.com");
  const role = await prisma.role.create({ data: { key: KEY, label: `E2E fields ${stamp}`, tier: "Executive Staff", scope: "ALL", permissions: { create: [
    { module: "hr", actions: ["view", "edit", "export"] }, { module: "kpis", actions: ["view", "edit"] }, { module: "access", actions: ["view", "create", "edit", "export"] },
  ] } } });
  roleId = role.id;
  const email = `fields-hka-${stamp}@places.test`;
  userId = (await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } })).id;
  // the employee whose file and account are read and saved
  const sales = await prisma.role.findUniqueOrThrow({ where: { key: "sales" } });
  const staff = await prisma.user.create({ data: { email: `staff-hka-${stamp}@places.test`, phone: PHONE, status: "ACTIVE", roles: { create: [{ roleId: sales.id, primary: true }] },
    employee: { create: { name: NAME, jobTitle: "Sales", department: "Sales", salary: 12000, target: 50000 } } }, include: { employee: true } });
  staffId = staff.id; employeeId = staff.employee!.id;
  person = await session(email);
  const rules = { hr: { salary: "hide", target: "read" }, kpis: { money: "hide", plan: "read" }, access: { phone: "hide", otpRequired: "read" } };
  for (const [module, r] of Object.entries(rules)) assert.equal((await call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body: { module, rules: r } })).status, 204);
});
after(async () => {
  const ids = [userId, staffId, madeId].filter(Boolean);
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [roleId, employeeId, ...ids] } }, { userId: { in: ids } }] } });
  await prisma.authToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.employee.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.roleFieldRule.deleteMany({ where: { roleId } });
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

/** The text of every file in a zip (xlsx). */
function zipText(b: Buffer): string {
  const end = b.length - 22;
  let at = b.readUInt32LE(end + 16), text = "";
  for (let i = b.readUInt16LE(end + 10); i > 0; i--) {
    const len = b.readUInt16LE(at + 28), size = b.readUInt32LE(at + 20), local = b.readUInt32LE(at + 42);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28), data = b.subarray(start, start + size);
    text += (b.readUInt16LE(at + 10) === 8 ? inflateRawSync(data) : data).toString("utf8");
    at += 46 + len + b.readUInt16LE(at + 30) + b.readUInt16LE(at + 32);
  }
  return text;
}
const file = async (path: string, cookie: string) => zipText(Buffer.from(await (await fetch(`${API}${path}`, { headers: { cookie } })).arrayBuffer()));

test("the catalogs: the identity can't be hidden; the person learns the rules", async () => {
  assert.equal((await call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body: { module: "hr", rules: { name: "hide" } } })).status, 400);
  assert.equal((await call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body: { module: "access", rules: { roles: "read" } } })).status, 400);
  // the role creates accounts: the email (required) can't be hidden from it
  assert.equal((await call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body: { module: "access", rules: { email: "hide" } } })).status, 400);
  const me = (await call("/auth/me", { cookie: person })).body as { fields: Record<string, object> };
  assert.deepEqual([me.fields.hr, me.fields.kpis, me.fields.access], [{ salary: "hide", target: "read" }, { money: "hide", plan: "read" }, { phone: "hide", otpRequired: "read" }]);
});

test("HR: the salary and what's computed from it never leave the API; a save keeps the hidden and read-only values", async () => {
  const list = (await call(`/hr/employees?q=${encodeURIComponent(NAME)}`, { cookie: person })).body as { items: Record<string, unknown>[] };
  assert.deepEqual([list.items.length, list.items[0]!.salary, list.items[0]!.target], [1, "0.00", "50000.00"]);
  const mine = (await call(`/hr/employees/${employeeId}`, { cookie: person })).body as Record<string, unknown>;
  assert.equal(mine.salary, "0.00");
  assert.equal(((await call(`/hr/employees/${employeeId}`, { cookie: admin })).body as Record<string, unknown>).salary, "12000.00");
  // «التوفير»: no salary, deduction or net for the person, the admin has them
  const ded = (c: string) => call("/hr/deductions", { cookie: c }).then((r) => (r.body as { rows: { employeeId: string; salary: string; amount: string; net: string }[]; totals: { salary: string } }));
  const [p, a] = await Promise.all([ded(person), ded(admin)]);
  assert.ok(p.rows.some((r) => r.employeeId === employeeId) && p.rows.every((r) => r.salary === "0.00" && r.amount === "0.00" && r.net === "0.00"));
  assert.equal(p.totals.salary, "0.00");
  assert.equal(a.rows.find((r) => r.employeeId === employeeId)?.salary, "12000.00");
  // the attendance export has no amount column
  assert.doesNotMatch(await file("/hr/attendance/export", person), /مبلغ الخصم/);
  // the person saves the whole file: salary (hidden) and target (read only) are kept, the commission is saved
  const put = await call(`/hr/employees/${employeeId}`, { method: "PATCH", cookie: person, body: { salary: "1", target: "999", commissionPct: 5 } });
  assert.equal(put.status, 200);
  assert.equal((put.body as Record<string, unknown>).salary, "0.00");
  const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  assert.deepEqual([e.salary.toFixed(2), e.target.toFixed(2), e.commissionPct.toFixed(2)], ["12000.00", "50000.00", "5.00"]);
});

test("KPIs: the money is the watcher's view for the person; the pay can't be changed", async () => {
  const board = (await call("/kpis/board?scope=all", { cookie: person })).body as { cards: { id: string; money: string | null }[]; seesMoney: boolean };
  assert.equal(board.seesMoney, false);
  assert.ok(board.cards.length && board.cards.every((c) => c.money === null));
  const card = (await call(`/kpis/cards/${board.cards[0]!.id}`, { cookie: person })).body as { pay: unknown; can: { pay: boolean; plan: boolean } };
  assert.deepEqual([card.pay, card.can.pay, card.can.plan], [null, false, false]);
  assert.notEqual(((await call(`/kpis/cards/${board.cards[0]!.id}`, { cookie: admin })).body as { pay: unknown }).pay, null);
  assert.equal((await call(`/kpis/cards/${board.cards[0]!.id}/pay`, { method: "PATCH", cookie: person, body: { base: "salary", period: "month", amount: null } })).status, 403);
  assert.equal((await call("/kpis/bands", { method: "PUT", cookie: person, body: { top: 120, full: 100, partial: 80, low: 60, rewardPercent: 20, cutPercent: 10 } })).status, 403);
  assert.equal(((await call("/kpis/company", { cookie: person })).body as { bands: unknown }).bands, null);
});

test("accounts: the mobile never leaves the API, isn't searched, and a save or a new account can't set it", async () => {
  const find = (c: string, q: string) => call(`/access/users?q=${encodeURIComponent(q)}`, { cookie: c }).then((r) => (r.body as { items: { id: string; phone: string | null }[] }).items);
  assert.ok((await find(admin, PHONE)).some((u) => u.id === staffId));
  assert.ok(!(await find(person, PHONE)).some((u) => u.id === staffId), "a search on the hidden mobile is dropped");
  const row = (await find(person, NAME)).find((u) => u.id === staffId);
  assert.equal(row?.phone, null);
  assert.equal(((await call(`/access/users/${staffId}`, { cookie: person })).body as { phone: unknown }).phone, null);
  const sheet = await file(`/access/users/export?q=${encodeURIComponent(NAME)}`, person);
  assert.match(sheet, new RegExp(`staff-hka-${stamp}`));
  assert.doesNotMatch(sheet, new RegExp(PHONE));
  assert.doesNotMatch(sheet, /الموبايل/);
  // a save: the mobile (hidden) and the OTP (read only) are kept
  const body = { name: NAME, email: `staff-hka-${stamp}@places.test`, phone: "01999999999", department: "Sales", role: "sales", otpRequired: true };
  assert.equal((await call(`/access/users/${staffId}`, { method: "PUT", cookie: person, body })).status, 200);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: staffId } });
  assert.deepEqual([u.phone, u.otpRequired], [PHONE, false]);
  // a new account: what the person may not set starts empty
  const made = await call("/access/users", { method: "POST", cookie: person, body: { ...body, name: `${NAME} 2`, email: `made-hka-${stamp}@places.test` } });
  assert.equal(made.status, 201);
  madeId = (made.body as { id: string }).id;
  const m = await prisma.user.findUniqueOrThrow({ where: { id: madeId } });
  assert.deepEqual([m.phone, m.otpRequired], [null, false]);
});
