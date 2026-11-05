/**
 * 2.16 · Manar's daily tasks to her team (M-03 3.1: at most 30 a day each) against the real API: only she gives them,
 * only to the people who report to her, and only the person it's for marks it done. Plus Sara's upload time on the unit.
 * Manar = inventory (approve), Randa = resale, Sara and Marwa = inventory staff, Mohamed Mohsen = sales.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const T = `E2E ${stamp} مهمة`;
let manar: string, randa: string, sara: string, marwa: string, sales: string;
const users: Record<string, string> = {};

before(async () => {
  const emails = { manar: "manar.ahmed@places.com", randa: "randa.mohamed@places.com", sara: "sara.abdelhalim@places.com", marwa: "marwa.mostafa@places.com", sales: "m.mohsen@places.com" };
  [manar, randa, sara, marwa, sales] = await Promise.all(Object.values(emails).map((e) => session(e)));
  for (const [k, email] of Object.entries(emails)) users[k] = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
});
after(async () => {
  const ids = (await prisma.task.findMany({ where: { title: { startsWith: T } }, select: { id: true } })).map((t) => t.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Task", entityId: { in: ids } } });
  await prisma.task.deleteMany({ where: { id: { in: ids } } });
  await prisma.notification.deleteMany({ where: { text: { contains: T } } });
  await prisma.$disconnect();
});

const give = (cookie: string, toUserId: string, n: number | string) => call("/inventory/team-tasks", { method: "POST", cookie, body: { toUserId, title: `${T} ${n}` } });
const today = () => new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" })}T00:00:00Z`);

test("Manar's team is who reports to her: Randa, Sara, Marwa, each with today's count; sales and Randa can't give", async () => {
  const r = await call("/inventory/team-tasks/team", { cookie: manar });
  assert.equal(r.status, 200);
  const team = r.body as Array<{ id: string; name: string; today: number; room: number }>;
  for (const k of ["randa", "sara", "marwa"]) assert.ok(team.some((p) => p.id === users[k]), k);
  assert.ok(!team.some((p) => p.id === users.sales));
  assert.equal((await call("/inventory/team-tasks/team", { cookie: sales })).status, 403);
  assert.equal((await give(randa, users.sara!, 0)).status, 403);
  assert.equal((await give(manar, users.sales!, 0)).status, 400, "not on her team");
  assert.equal((await call("/inventory/team-tasks", { method: "POST", cookie: manar, body: { toUserId: users.sara, title: " " } })).status, 400);
});

test("Sara gets it on her home page and is told; only she marks it done; it's audited", async () => {
  const r = await give(manar, users.sara!, "صور U-104");
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = (r.body as { id: string }).id;
  const mine = (await call("/inventory/team-tasks/mine", { cookie: sara })).body as Array<{ id: string; status: string; by: { name: string } }>;
  assert.equal(mine.find((t) => t.id === id)?.status, "todo");
  assert.equal(mine.find((t) => t.id === id)?.by.name, "منار أحمد");
  assert.ok(await prisma.notification.findFirst({ where: { userId: users.sara, text: { contains: `${T} صور U-104` } } }));
  assert.equal((await call(`/inventory/team-tasks/${id}/done`, { method: "POST", cookie: marwa })).status, 404, "not hers");
  assert.equal((await call(`/inventory/team-tasks/${id}/done`, { method: "POST", cookie: sara })).status, 204);
  const given = (await call("/inventory/team-tasks", { cookie: manar })).body as Array<{ id: string; status: string }>;
  assert.equal(given.find((t) => t.id === id)?.status, "done");
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Task", entityId: id, action: "done" } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Task", entityId: id, action: "create" } }));
});

test("at most 30 a day each (M-03 3.1): the 31st is refused, even when sent at the same time", async () => {
  const already = await prisma.task.count({ where: { kind: "team", toUserId: users.marwa, dueOn: today() } });
  const fill = Math.max(0, 28 - already);
  await prisma.task.createMany({ data: Array.from({ length: fill }, (_, i) => ({ kind: "team", title: `${T} ${i}`, byUserId: users.manar!, toUserId: users.marwa!, dueOn: today() })) });
  const at = await prisma.task.count({ where: { kind: "team", toUserId: users.marwa, dueOn: today() } });
  const room = 30 - at;
  const sent = await Promise.all(Array.from({ length: room + 2 }, (_, i) => give(manar, users.marwa!, `معاً ${i}`)));
  assert.equal(sent.filter((r) => r.status === 201).length, room);
  const refused = sent.filter((r) => r.status === 400);
  assert.equal(refused.length, 2);
  assert.match(JSON.stringify(refused[0]!.body), /30 مهمة النهارده/);
  const team = (await call("/inventory/team-tasks/team", { cookie: manar })).body as Array<{ id: string; today: number; room: number }>;
  assert.deepEqual(team.filter((p) => p.id === users.marwa).map((p) => [p.today, p.room]), [[30, 0]]);
});
