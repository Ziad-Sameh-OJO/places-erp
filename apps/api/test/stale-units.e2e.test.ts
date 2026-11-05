/**
 * M-03 2.4 · (21) · 2.17 end-to-end: the daily job, at a controlled time. A unit whose last owner update is over a
 * month old gets one follow-up task with its owner (Resale → Randa, the rest → Manar), stays available to sales,
 * nothing on a Friday, and running it twice changes nothing.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { staleUnitsTick } from "../../worker/src/processors/stale-units.ts";

const stamp = Date.now().toString(36);
const started = new Date();
const SUNDAY = new Date("2026-11-08T09:30:00Z"); // 11:30 Cairo, a working day
const FRIDAY = new Date("2026-11-13T09:30:00Z");
const DAY = 86_400_000;
let resale: string, rent: string, fresh: string;

before(async () => {
  const unit = (n: number, type: "Rent" | "Resale", daysAgo: number) => prisma.unit.create({ data: {
    code: `U-S${stamp}${n}`, type, project: `مشروع ${stamp}`, area: "التجمع الخامس", space: 300 + n, condition: "Finished", pdfStatus: "confirmed",
    lastOwnerUpdateAt: new Date(SUNDAY.getTime() - daysAgo * DAY),
  } });
  resale = (await unit(1, "Resale", 40)).id;
  rent = (await unit(2, "Rent", 31)).id;
  fresh = (await unit(3, "Rent", 10)).id;
});

after(async () => {
  const tasks = await prisma.task.findMany({ where: { kind: "followup", byUserId: null, createdAt: { gte: started } }, select: { id: true } });
  await prisma.notification.deleteMany({ where: { OR: tasks.map((t) => ({ link: { contains: t.id } })) } });
  await prisma.auditLog.deleteMany({ where: { entity: "Task", entityId: { in: tasks.map((t) => t.id) } } });
  await prisma.task.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } });
  await prisma.unit.deleteMany({ where: { code: { startsWith: `U-S${stamp}` } } });
  await prisma.$disconnect();
});

const followups = (unitId: string) => prisma.task.findMany({ where: { unitId, kind: "followup" } });
const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

test("nothing on a Friday (the day off)", async () => {
  assert.equal(await staleUnitsTick(FRIDAY), 0);
  assert.equal((await followups(resale)).length, 0);
});

test("a month without an owner update → one follow-up with the owner: Resale → Randa, Rent → Manar; a fresh unit none", async () => {
  await staleUnitsTick(SUNDAY);
  const [r] = await followups(resale);
  const [m] = await followups(rent);
  assert.equal(r!.toUserId, await userId("randa.mohamed@places.com"));
  assert.equal(m!.toUserId, await userId("manar.ahmed@places.com"));
  assert.equal(r!.byUserId, null); // the system
  assert.equal(r!.dueOn.toISOString().slice(0, 10), "2026-11-08");
  assert.equal((await followups(fresh)).length, 0);
  assert.equal(await prisma.notification.count({ where: { link: { contains: r!.id } } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Task", entityId: r!.id, action: "create" } }), 1);
  // the unit stays available to sales (Q21)
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: resale } })).status, "available");

  await staleUnitsTick(SUNDAY); // idempotent
  await staleUnitsTick(new Date(SUNDAY.getTime() + DAY));
  assert.equal((await followups(resale)).length, 1);
  assert.equal((await followups(rent)).length, 1);

  // Done → the owner was called; if the update is still missing the next day, a new follow-up comes
  await prisma.task.update({ where: { id: r!.id }, data: { status: "done", doneAt: new Date() } });
  await staleUnitsTick(new Date(SUNDAY.getTime() + DAY));
  assert.equal((await followups(resale)).length, 2);
});
