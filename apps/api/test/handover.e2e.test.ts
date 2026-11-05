/**
 * M-09 2.2 · 7.1 «موظف مشي: الحساب يتقفل، والليدز بتاعته تتنقل بموافقة مديره», against the real API and database.
 * Nancy (HR side, «access: create») asks; the leaver's direct manager (Ahmed Islam here) decides; Mohsen (sales) can't ask.
 * Its own accounts on «@handover.test», so other files' clean-ups never touch them.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = Date.now();
let nancy: string, boss: string, sales: string, bossId: string;
let leaver: { userId: string; employeeId: string }, heir: { userId: string; employeeId: string };

async function account(tag: string, managerId: string | null, status: "ACTIVE" | "DISABLED") {
  const u = await prisma.user.create({ data: { email: `ho-${tag}-${stamp}@handover.test`, status } });
  const e = await prisma.employee.create({ data: { userId: u.id, name: `E2E نقل ${tag}`, jobTitle: "Sales", department: "المبيعات", salary: 0, managerId } });
  return { userId: u.id, employeeId: e.id };
}

before(async () => {
  [nancy, boss, sales] = await Promise.all([session("nancy.islam@places.com"), session("ahmed.islam@places.com"), session("m.mohsen@places.com")]);
  const b = await prisma.user.findUniqueOrThrow({ where: { email: "ahmed.islam@places.com" }, include: { employee: true } });
  bossId = b.id;
  leaver = await account("leaver", b.employee!.id, "DISABLED");
  heir = await account("heir", null, "ACTIVE");
  const lead = (n: number, stage: "FRESH" | "INTERESTED" | "DONE_DEAL") => ({
    code: `L-HO${stamp}-${n}`, name: `E2E نقل ${n}`, area: "New Cairo", type: "Rent", channel: "Facebook", createdById: bossId, assignedToId: leaver.employeeId, stage,
  });
  await prisma.lead.createMany({ data: [lead(1, "FRESH"), lead(2, "INTERESTED"), lead(3, "DONE_DEAL")] });
  await prisma.task.createMany({ data: [
    { kind: "followup", toUserId: leaver.userId, dueOn: new Date(), status: "todo" },
    { kind: "followup", toUserId: leaver.userId, dueOn: new Date(), status: "done" },
  ] });
});

after(async () => {
  const ids = [leaver.userId, heir.userId];
  await prisma.leadActivity.deleteMany({ where: { lead: { code: { startsWith: `L-HO${stamp}` } } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-HO${stamp}` } } });
  await prisma.task.deleteMany({ where: { toUserId: { in: ids } } });
  await prisma.handover.deleteMany({ where: { fromUserId: { in: ids } } });
  await prisma.employee.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

const ask = (cookie: string, to: string, from = leaver.userId) => call(`/access/users/${from}/handover`, { method: "POST", cookie, body: { to } });

test("a salesperson can't ask; the work can't go to the leaver himself or to a stopped account", async () => {
  assert.equal((await ask(sales, heir.userId)).status, 403);
  assert.match((await ask(nancy, leaver.userId)).body.error, /حد تاني/);
  assert.match((await ask(nancy, heir.userId, heir.userId)).body.error, /لسه شغال/); // heir is still working
});

test("HR asks, only the direct manager decides, and approving moves the open leads and tasks once", async () => {
  const r = await ask(nancy, heir.userId);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id as string;
  assert.match((await ask(nancy, heir.userId)).body.error, /مستني موافقة/); // one pending at a time

  const mine = (await call("/access/handovers/mine", { cookie: boss })).body as Array<{ id: string; leads: number; tasks: number }>;
  const row = mine.find((x) => x.id === id);
  assert.deepEqual([row?.leads, row?.tasks], [2, 1]); // the Done Deal and the done task stay
  assert.equal((await call("/access/handovers/mine", { cookie: nancy })).body.some((x: { id: string }) => x.id === id), false);

  assert.equal((await call(`/access/handovers/${id}/decision`, { method: "POST", cookie: nancy, body: { approve: true } })).status, 403);
  assert.equal((await call(`/access/handovers/${id}/decision`, { method: "POST", cookie: boss, body: { approve: true } })).status, 204);
  assert.equal((await call(`/access/handovers/${id}/decision`, { method: "POST", cookie: boss, body: { approve: true } })).status, 409);

  const leads = await prisma.lead.findMany({ where: { code: { startsWith: `L-HO${stamp}` } }, orderBy: { code: "asc" } });
  assert.deepEqual(leads.map((l) => l.assignedToId), [heir.employeeId, heir.employeeId, leaver.employeeId]);
  assert.equal(await prisma.task.count({ where: { toUserId: heir.userId, status: "todo" } }), 1);
  assert.equal(await prisma.task.count({ where: { toUserId: leaver.userId, status: "done" } }), 1);
  const log = await prisma.auditLog.findFirst({ where: { entity: "Handover", entityId: id, action: "handover-approved" } });
  assert.equal(log?.userId, bossId);
});

test("a rejected request moves nothing", async () => {
  await prisma.lead.update({ where: { code: `L-HO${stamp}-1` }, data: { assignedToId: leaver.employeeId } });
  const id = (await ask(nancy, heir.userId)).body.id as string;
  assert.equal((await call(`/access/handovers/${id}/decision`, { method: "POST", cookie: boss, body: { approve: false } })).status, 204);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { code: `L-HO${stamp}-1` } })).assignedToId, leaver.employeeId);
  assert.equal((await prisma.handover.findUniqueOrThrow({ where: { id } })).status, "rejected");
});
