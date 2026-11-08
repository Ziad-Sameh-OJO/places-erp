/**
 * 2.29 · «ابديت مع المالك النهارده» from the unit's drawer (the demo's unitUpdate, M-03 2.4): the last update becomes
 * today so the unit leaves «محتاجة ابديت», its open «متابعة مع المالك» task is done, the contact is on the owner's file
 * (M-10 2.4), all audited. Only the people who edit units (Manar, Randa); sales and HR are refused.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const P = `E2E ${stamp} owner update`;
const PHONE = `010${stamp.slice(-8)}`;
const DAY = 86_400_000;
let manar: string, randa: string, sales: string, hr: string, unitId: string, code: string, ownerId: string, taskId: string, doneTaskId: string;

before(async () => {
  [manar, randa, sales, hr] = await Promise.all(["manar.ahmed@places.com", "randa.mohamed@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: {
    type: "Resale", project: P, area: "الشيخ زايد", space: 85, condition: "متشطب", building: "Z3", agentId, ownerName: "أ. نبيل", ownerPhone: PHONE, pricePerSqm: "36000",
  } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ({ id: unitId, code } = r.body as { id: string; code: string });
  // a month and more without an update: the job's follow-up for Randa (M-03 2.4), and an older one already done
  const u = await prisma.unit.update({ where: { id: unitId }, data: { lastOwnerUpdateAt: new Date(Date.now() - 40 * DAY) }, select: { ownerId: true } });
  ownerId = u.ownerId!;
  const randaId = (await prisma.user.findUniqueOrThrow({ where: { email: "randa.mohamed@places.com" } })).id;
  const task = (status: string) => prisma.task.create({ data: { kind: "followup", unitId, byUserId: null, toUserId: randaId, dueOn: new Date(), status, note: "last update عدّى عليه أكتر من شهر · كلّم المالك" } });
  taskId = (await task("todo")).id;
  doneTaskId = (await task("done")).id;
});

after(async () => {
  const said = (await prisma.clientInteraction.findMany({ where: { clientId: ownerId }, select: { id: true } })).map((i) => i.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [unitId, taskId, doneTaskId, ownerId, ...said] } } });
  await prisma.task.deleteMany({ where: { unitId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.client.deleteMany({ where: { id: ownerId } }); // its interactions go with it
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

const update = (cookie: string, body: object = {}) => call(`/inventory/units/${unitId}/owner-update`, { method: "POST", cookie, body });
const stale = async () => ((await call(`/inventory/units?q=${encodeURIComponent(P)}&stale=true`, { cookie: manar })).body as { total: number }).total;

test("only the people who edit units: sales and HR are refused, a long comment too", async () => {
  assert.equal(await stale(), 1, "needs an update before");
  assert.equal((await update(sales)).status, 403);
  assert.equal((await update(hr)).status, 403);
  assert.equal((await update(randa, { comment: "x".repeat(1001) })).status, 400);
  assert.equal((await call("/inventory/units/nope/owner-update", { method: "POST", cookie: randa, body: {} })).status, 404);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status, "todo");
});

test("Randa's update: today, out of «محتاجة ابديت», the follow-up done, on the owner's file, audited", async () => {
  const r = await update(randa, { comment: "لسه متاحة ونفس السعر" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const u = r.body as { stale: boolean; lastOwnerUpdateAt: string };
  assert.equal(u.stale, false);
  assert.ok(Date.now() - Date.parse(u.lastOwnerUpdateAt) < 60_000);
  assert.equal(await stale(), 0);

  const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  assert.equal(t.status, "done");
  assert.ok(t.doneAt);
  const randaId = (await prisma.user.findUniqueOrThrow({ where: { email: "randa.mohamed@places.com" } })).id;
  const closed = await prisma.auditLog.findFirst({ where: { entity: "Task", entityId: taskId, action: "status" } });
  assert.deepEqual([closed?.userId, closed?.before, closed?.after], [randaId, { status: "todo" }, { status: "done" }]);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Task", entityId: doneTaskId } }), 0, "a done task stays as it was");

  const audit = await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: unitId, action: "owner-update" } });
  assert.equal((audit?.after as { comment: string }).comment, "لسه متاحة ونفس السعر");

  const said = await prisma.clientInteraction.findFirst({ where: { clientId: ownerId } });
  assert.equal(said?.kind, "ابديت مع المالك");
  assert.equal(said?.text, `${code} · ${P} · لسه متاحة ونفس السعر`);
  assert.equal(said?.byId, randaId);
  // the PDF isn't touched: the last update isn't on it
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).pdfStatus, "draft");
});

test("Manar again without a comment: nothing left to close, the file gets the unit alone", async () => {
  assert.equal((await update(manar)).status, 200);
  const said = await prisma.clientInteraction.findMany({ where: { clientId: ownerId }, orderBy: { at: "asc" } });
  assert.equal(said.length, 2);
  assert.equal(said[1]?.text, `${code} · ${P}`);
});
