/**
 * 1.12 · «إعدادات توزيع المناطق»: who covers each area (M-01 Q1). The settings module: Operations Head / Sales
 * Director / admin edit, Operations reads, sales can't see it. A change routes the next lead differently.
 * The routing setting and the rotation state are put back as they were.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const AREA = "مدينة نصر";
let admin: string, salesdir: string, ops: string, sales: string, a: string, b: string, hrEmployee: string;
let saved: { routing: unknown; areaRouting: unknown };
const leads: string[] = [];

before(async () => {
  [admin, ops, sales] = await Promise.all(["ahmed.islam@places.com", "heba.salah@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const dir = await prisma.user.findFirst({ where: { roles: { some: { role: { key: "salesdir" } } }, status: "ACTIVE" }, select: { email: true } });
  salesdir = dir ? await session(dir.email) : admin;
  const people = (await call("/leads/routing", { cookie: admin })).body.salespeople as { id: string }[];
  [a, b] = [people[0]!.id, people[1]!.id];
  hrEmployee = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "basant.elsawy@places.com" } } })).id;
  const get = async (key: string) => (await prisma.setting.findUnique({ where: { key } }))?.value;
  saved = { routing: await get("routing"), areaRouting: await get("areaRouting") };
});
after(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: leads } } });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) await prisma.setting.deleteMany({ where: { key } });
    else await prisma.setting.update({ where: { key }, data: { value: value as never } });
  }
  await prisma.auditLog.deleteMany({ where: { entity: "AreaRouting", at: { gte: new Date(Number(stamp)) } } });
  await prisma.$disconnect();
});

const tick = (cookie: string, area: string, employeeId: string, on: boolean) => call("/leads/routing", { method: "PUT", cookie, body: { area, employeeId, on } });
const pool = async () => ((await call("/leads/routing", { cookie: admin })).body.routing[AREA] ?? []) as string[];
const newLead = async (n: number) => {
  const r = await call("/leads", { method: "POST", cookie: admin, body: { name: `E2E-R ${stamp} ${n}`, phones: [`0128${stamp.slice(-6)}${n}`], area: AREA, type: "Rent", channel: "Facebook" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  leads.push(r.body.id);
  return r.body.assignedTo?.id as string | undefined;
};

test("who sees and changes the routing: Operations reads, sales can't see it, Sales Director / admin change it", async () => {
  assert.equal((await call("/leads/routing", { cookie: sales })).status, 403);
  const view = await call("/leads/routing", { cookie: ops });
  assert.equal(view.status, 200);
  assert.ok(view.body.areas.includes(AREA));
  assert.ok(view.body.salespeople.length >= 2);
  assert.equal((await tick(ops, AREA, a, true)).status, 403);
  assert.equal((await tick(sales, AREA, a, true)).status, 403);
  assert.equal((await tick(salesdir, AREA, a, true)).status, 200);
});

test("ticking and unticking, audited; only real areas and salespeople", async () => {
  for (const id of await pool()) await tick(admin, AREA, id, false);
  assert.deepEqual(await pool(), []);
  const r = await tick(admin, AREA, b, true);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.routing[AREA], [b]);
  await tick(admin, AREA, a, true);
  assert.deepEqual(await pool(), [b, a]); // added at the end of the rotation
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "AreaRouting", entityId: AREA, action: "add" }, orderBy: { at: "desc" } });
  assert.equal(audit.module, "settings");
  assert.deepEqual((audit.after as { salespeople: string[] }).salespeople, [b, a]);
  for (const [body, status] of [
    [{ area: "مش منطقة", employeeId: a, on: true }, 400], [{ area: AREA, employeeId: "nobody", on: true }, 400],
    [{ area: AREA, employeeId: hrEmployee, on: true }, 400], [{ area: AREA, employeeId: a }, 400], [{ area: "", employeeId: a, on: true }, 400],
  ] as const) assert.equal((await call("/leads/routing", { method: "PUT", cookie: admin, body })).status, status, JSON.stringify(body));
});

test("ten ticks at once all stay (the row is locked while it changes)", async () => {
  const people = ((await call("/leads/routing", { cookie: admin })).body.salespeople as { id: string }[]).slice(0, 10).map((p) => p.id);
  for (const id of await pool()) await tick(admin, AREA, id, false);
  const rs = await Promise.all(people.map((id) => tick(admin, AREA, id, true)));
  assert.ok(rs.every((r) => r.status === 200));
  assert.deepEqual([...(await pool())].sort(), [...people].sort());
});

test("changing who covers the area changes where the next lead goes (Q1)", async () => {
  for (const id of await pool()) await tick(admin, AREA, id, false);
  await tick(admin, AREA, a, true);
  assert.equal(await newLead(1), a);
  await tick(admin, AREA, a, false);
  await tick(admin, AREA, b, true);
  assert.equal(await newLead(2), b);
  // nobody covers it: the lead waits for Operations to assign it by hand
  await tick(admin, AREA, b, false);
  assert.equal(await newLead(3), undefined);
});
