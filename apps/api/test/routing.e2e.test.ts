/**
 * 1.12 · «إعدادات توزيع المناطق»: who covers each area (M-01 Q1). The settings module: Operations Head / Sales
 * Director / admin edit, Operations reads, sales can't see it. A change routes the next lead differently.
 * Only this file's area is put back as it was: other test files change other areas at the same time.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const AREA = "مدينة نصر";
let admin: string, salesdir: string, ops: string, sales: string, a: string, b: string, hrEmployee: string;
let savedPool: string[] | undefined;
const leads: string[] = [];

before(async () => {
  [admin, ops, sales] = await Promise.all(["ahmed.islam@places.com", "heba.salah@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const dir = await prisma.user.findFirst({ where: { roles: { some: { role: { key: "salesdir" } } }, status: "ACTIVE" }, select: { email: true } });
  salesdir = dir ? await session(dir.email) : admin;
  const people = (await call("/leads/routing", { cookie: admin })).body.salespeople as { id: string }[];
  [a, b] = [people[0]!.id, people[1]!.id];
  hrEmployee = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "basant.elsawy@places.com" } } })).id;
  savedPool = ((await prisma.setting.findUnique({ where: { key: "areaRouting" } }))?.value as Record<string, string[]> | undefined)?.[AREA];
});
after(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: leads } } });
  // this area only, in one statement, so a change another file made to another area meanwhile stays
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = CASE WHEN ${savedPool === undefined} THEN "value" - ${AREA} ELSE jsonb_set("value", ARRAY[${AREA}], ${JSON.stringify(savedPool ?? [])}::jsonb) END WHERE "key" = 'areaRouting'`;
  await prisma.auditLog.deleteMany({ where: { entity: "AreaRouting", at: { gte: new Date(Number(stamp)) } } });
  await prisma.$disconnect();
});

const tick = (cookie: string, area: string, employeeId: string, on: boolean) => call("/leads/routing", { method: "PUT", cookie, body: { area, employeeId, on } });
const pool = async () => ((await call("/leads/routing", { cookie: admin })).body.routing[AREA] ?? []) as string[];
const newLead = async (n: number) => {
  const r = await call("/leads", { method: "POST", cookie: admin, body: { name: `E2E-R ${stamp} ${n}`, phones: [`0128${stamp.slice(-5)}${String(n).padStart(2, "0")}`], area: AREA, type: "Rent", channel: "Facebook" } });
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

/* ---------------- 1.13 · the rotation and «ليد جديد اتوزع» ---------------- */

test("three leads in the same area go round its salespeople in order, then start again (1.13)", async () => {
  const people = ((await call("/leads/routing", { cookie: admin })).body.salespeople as { id: string }[]).slice(0, 3).map((p) => p.id);
  for (const id of await pool()) await tick(admin, AREA, id, false);
  for (const id of people) await tick(admin, AREA, id, true);
  const got = [await newLead(11), await newLead(12), await newLead(13), await newLead(14)];
  // the cursor may sit anywhere from earlier leads: what matters is the order — each next one, all three, then the first again
  const start = people.indexOf(got[0]!);
  assert.ok(start >= 0, `${got[0]} isn't in the area`);
  assert.deepEqual(got, [0, 1, 2, 3].map((i) => people[(start + i) % 3]));
});

test("someone whose account was switched off since they were ticked is skipped (1.13)", async () => {
  const leaver = await prisma.user.create({ data: { email: `e2e-left-${stamp}@places.test`, status: "DISABLED", employee: { create: { name: `E2E ساب ${stamp}`, jobTitle: "Sales", department: "Sales", salary: 0 } } }, include: { employee: true } });
  try {
    for (const id of await pool()) await tick(admin, AREA, id, false);
    await tick(admin, AREA, a, true);
    // put the leaver in the area directly (the screen only offers people still working here)
    await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY[${AREA}], ${JSON.stringify([leaver.employee!.id, a])}::jsonb) WHERE "key" = 'areaRouting'`;
    assert.equal(await newLead(21), a);
    assert.equal(await newLead(22), a);
  } finally {
    await prisma.employee.delete({ where: { id: leaver.employee!.id } });
    await prisma.user.delete({ where: { id: leaver.id } });
  }
});

test("«ليد جديد اتوزع» reaches the salesperson and the Team Leaders (the rule's default), with a link to the lead (1.13)", async () => {
  for (const id of await pool()) await tick(admin, AREA, id, false);
  await tick(admin, AREA, a, true);
  const since = new Date();
  const name = `E2E-R ${stamp} 31`;
  assert.equal(await newLead(31), a);
  const owner = (await prisma.employee.findUniqueOrThrow({ where: { id: a } })).userId;
  const sent = await prisma.notification.findMany({ where: { text: { contains: name }, createdAt: { gte: since } } });
  assert.ok(sent.some((n) => n.userId === owner), "the salesperson got it");
  const tls = (await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: "tl" } } } }, select: { id: true } })).map((u) => u.id);
  assert.ok(tls.length && tls.every((id) => sent.some((n) => n.userId === id)), "every Team Leader got it");
  const mine = sent.find((n) => n.userId === owner)!;
  const salesName = (await prisma.employee.findUniqueOrThrow({ where: { id: a } })).name;
  assert.equal(mine.text, `ليد جديد ${name} راح لـ ${salesName} (${AREA})`); // the demo's words
  assert.match(mine.link ?? "", /^\/leads\?open=/);
  await prisma.notification.deleteMany({ where: { text: { contains: `E2E-R ${stamp}` } } });
});

test("a lead Telesales keeps, or a salesperson enters for themselves, tells nobody (demo)", async () => {
  const since = new Date();
  const hadeer = await session("hadeer.tarek@places.com");
  const kept = await call("/leads", { method: "POST", cookie: hadeer, body: { name: `E2E-R ${stamp} 41`, phones: [`0128${stamp.slice(-5)}41`], area: AREA, type: "Rent", channel: "Facebook", keep: true } });
  assert.equal(kept.status, 201, JSON.stringify(kept.body));
  leads.push(kept.body.id);
  const own = await call("/leads", { method: "POST", cookie: sales, body: { name: `E2E-R ${stamp} 42`, phones: [`0128${stamp.slice(-5)}42`], area: AREA, type: "Rent", channel: "Facebook" } });
  assert.equal(own.status, 201, JSON.stringify(own.body));
  leads.push(own.body.id);
  assert.equal(await prisma.notification.count({ where: { text: { contains: `E2E-R ${stamp} 4` }, createdAt: { gte: since } } }), 0);
});

test("nine leads created at the same moment in one area: each of its three salespeople gets exactly three (no lost turn)", async () => {
  const people = ((await call("/leads/routing", { cookie: admin })).body.salespeople as { id: string }[]).slice(0, 3).map((p) => p.id);
  for (const id of await pool()) await tick(admin, AREA, id, false);
  for (const id of people) await tick(admin, AREA, id, true);
  const got = await Promise.all([51, 52, 53, 54, 55, 56, 57, 58, 59].map((n) => newLead(n)));
  const count = (id: string) => got.filter((x) => x === id).length;
  assert.deepEqual(people.map(count), [3, 3, 3], JSON.stringify(got));
});

/* ---------------- 1.14 · «اسحب الليد وحوّله» ---------------- */

test("only Operations, the Sales Director and the admin hand a lead over; sales and Team Leaders can't (M-01 4.1)", async () => {
  for (const id of await pool()) await tick(admin, AREA, id, false);
  await tick(admin, AREA, a, true);
  await newLead(61);
  const lead = leads.at(-1)!;
  const tl = await session("abdallah.sleem@places.com");
  assert.equal((await call(`/leads/${lead}/assign`, { method: "POST", cookie: sales, body: { to: b } })).status, 403);
  assert.equal((await call(`/leads/${lead}/assign`, { method: "POST", cookie: tl, body: { to: b } })).status, 403);
  assert.equal((await call(`/leads/${lead}/assign`, { method: "POST", cookie: ops, body: { to: b } })).status, 200);
  assert.equal((await call(`/leads/${lead}/assign`, { method: "POST", cookie: salesdir, body: { to: a } })).status, 200);
});

test("handing over: a fresh SLA with the new salesperson, Activity and audit «من … لـ …», and they're told", async () => {
  for (const id of await pool()) await tick(admin, AREA, id, false);
  await tick(admin, AREA, a, true);
  await newLead(62);
  const lead = leads.at(-1)!;
  const [fromName, toName] = await Promise.all([a, b].map(async (id) => (await prisma.employee.findUniqueOrThrow({ where: { id } })).name));
  await prisma.lead.update({ where: { id: lead }, data: { touched: true, firstActionAt: new Date(Date.now() - 3_600_000), assignedAt: new Date(Date.now() - 7_200_000) } });
  const since = new Date();
  const r = await call(`/leads/${lead}/assign`, { method: "POST", cookie: ops, body: { to: b } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.assignedTo.id, b);
  const row = await prisma.lead.findUniqueOrThrow({ where: { id: lead } });
  assert.equal(row.touched, false);
  assert.equal(row.firstActionAt, null);
  assert.ok(row.assignedAt! >= since); // the SLA counts from now
  assert.ok(r.body.activities.some((x: { text: string }) => x.text === `اتسحب يدوي من ${fromName} واتحوّل لـ ${toName}`));
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: lead, action: "reassign" } });
  assert.deepEqual([audit.before, audit.after], [{ assignedToId: a, name: fromName }, { assignedToId: b, name: toName }]);
  const logs = (await call(`/leads/${lead}/logs`, { cookie: admin })).body as { text: string }[];
  assert.ok(logs.some((x) => x.text === `اتسحب يدوي من ${fromName} لـ ${toName}`));
  const toUser = (await prisma.employee.findUniqueOrThrow({ where: { id: b } })).userId;
  const told = await prisma.notification.findFirst({ where: { userId: toUser, createdAt: { gte: since }, text: { contains: `اتحوّلك من ${fromName}` } } });
  assert.ok(told, "the new salesperson was told");
  // the same person again, someone who isn't a salesperson, nobody, a lead that isn't there
  const same = await call(`/leads/${lead}/assign`, { method: "POST", cookie: ops, body: { to: b } });
  assert.equal(same.status, 400);
  assert.match(same.body.error, /بالفعل/);
  assert.equal((await call(`/leads/${lead}/assign`, { method: "POST", cookie: ops, body: { to: hrEmployee } })).status, 400);
  assert.equal((await call(`/leads/${lead}/assign`, { method: "POST", cookie: ops, body: {} })).status, 400);
  assert.equal((await call(`/leads/nope/assign`, { method: "POST", cookie: ops, body: { to: a } })).status, 404);
  await prisma.notification.deleteMany({ where: { createdAt: { gte: since }, text: { contains: `E2E-R ${stamp}` } } });
});

test("whoever gets a lead by hand skips their next turn in the rotation (Q2, 1.14 «يخلص لما»)", async () => {
  for (const id of await pool()) await tick(admin, AREA, id, false);
  await tick(admin, AREA, a, true);
  await tick(admin, AREA, b, true);
  // a known start: this area's rotation at its beginning, nobody of the two skipping a turn
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set(jsonb_set(jsonb_set("value", ARRAY['cursor', ${AREA}], '0'::jsonb), ARRAY['skipTurns', ${a}], '0'::jsonb), ARRAY['skipTurns', ${b}], '0'::jsonb) WHERE "key" = 'routing'`;
  assert.equal(await newLead(71), a); // a, and b's turn is next
  await newLead(72); // b
  const handed = leads.at(-1)!;
  // hand that lead to a: a's next turn is used up. The rotation is back at a, so without it the next three would be
  // a, b, a — with it a is skipped once: b, a, b
  assert.equal((await call(`/leads/${handed}/assign`, { method: "POST", cookie: ops, body: { to: a } })).status, 200);
  const next = [await newLead(73), await newLead(74), await newLead(75)];
  assert.deepEqual(next, [b, a, b]);
});
