/**
 * M-04 · tasks end-to-end (4.1): who gives which kind (3.1), who sees which tasks (4.1), To Do → In Progress → Done with
 * Undo (3.3 · 7.1), the Retouch that only Manar's approval closes (2.2), reassigning, the audit and the notices.
 * Manar (inventory) gives the photographer (Bayoumi) a shoot; Rahma (marketing) sees it; a salesperson has no tasks.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = Date.now().toString(36);
let admin: string, manar: string, rahma: string, bayoumi: string, randa: string, sales: string;
let bayoumiId: string, rahmaId: string, randaId: string, unitId: string;
const tasks: string[] = [];
const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
const today = new Date().toISOString().slice(0, 10);

before(async () => {
  [admin, manar, rahma, bayoumi, randa, sales] = await Promise.all(
    ["ahmed.islam@places.com", "manar.ahmed@places.com", "rahma.hassan@places.com", "abdelrahman.bayoumi@places.com", "randa.mohamed@places.com", "anas@places.com"].map((e) => session(e)),
  );
  [bayoumiId, rahmaId, randaId] = await Promise.all(["abdelrahman.bayoumi@places.com", "rahma.hassan@places.com", "randa.mohamed@places.com"].map(userId));
  unitId = (await prisma.unit.create({ data: { code: `U-T${stamp}`, type: "Rent", project: `مشروع ${stamp}`, area: "التجمع الخامس", space: 500, condition: "Finished", ownerName: "مالك تجربة", ownerPhone: "01000000000" } })).id;
});

after(async () => {
  await prisma.notification.deleteMany({ where: { OR: tasks.map((id) => ({ link: { contains: id } })) } });
  await prisma.task.deleteMany({ where: { id: { in: tasks } } });
  await prisma.unit.deleteMany({ where: { code: `U-T${stamp}` } });
  await prisma.$disconnect();
});

async function give(cookie: string, body: Record<string, unknown>) {
  const r = await call("/tasks", { method: "POST", cookie, body: { dueOn: today, ...body } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tasks.push(r.body.id);
  return r.body.id as string;
}
const move = (cookie: string, id: string, status: string) => call(`/tasks/${id}/status`, { method: "POST", cookie, body: { status } });
const board = async (cookie: string) => (await call("/tasks", { cookie })).body as Array<{ id: string; status: string; can: { moves: string[] } }>;

test("without «tasks» permission: 403 (a salesperson)", async () => {
  assert.equal((await call("/tasks", { cookie: sales })).status, 403);
  assert.equal((await call("/tasks", { method: "POST", cookie: sales, body: { kind: "photo", toUserId: bayoumiId, dueOn: today, unitId } })).status, 403);
  assert.equal((await call("/tasks/options", { cookie: bayoumi })).status, 403); // the photographer only works his tasks
});

test("who gives which kind (M-04 3.1): Manar the shoots, Rahma the marketing tasks; the assignee must fit the kind", async () => {
  const kinds = async (c: string) => (await call("/tasks/options", { cookie: c })).body.kinds.map((k: { key: string }) => k.key);
  assert.deepEqual(await kinds(manar), ["photo", "retouch", "toResale"]);
  assert.deepEqual(await kinds(randa), ["photo", "retouch", "toResale"]); // «منار / رندا (تصوير)»
  assert.deepEqual(await kinds(rahma), ["marketing"]);
  const opts = (await call("/tasks/options", { cookie: rahma })).body;
  assert.ok(opts.marketingTypes.includes("Website leasing"));
  assert.equal((await call("/tasks", { method: "POST", cookie: rahma, body: { kind: "photo", toUserId: bayoumiId, dueOn: today, unitId } })).status, 403);
  assert.equal((await call("/tasks", { method: "POST", cookie: manar, body: { kind: "photo", toUserId: rahmaId, dueOn: today, unitId } })).status, 400); // not a photographer
  assert.equal((await call("/tasks", { method: "POST", cookie: manar, body: { kind: "photo", toUserId: bayoumiId, dueOn: today } })).status, 400); // no unit
  assert.equal((await call("/tasks", { method: "POST", cookie: manar, body: { kind: "followup", toUserId: randaId, dueOn: today, unitId } })).status, 400); // the system's
  assert.equal((await call("/tasks", { method: "POST", cookie: rahma, body: { kind: "marketing", toUserId: bayoumiId, dueOn: today, title: "مش في القايمة" } })).status, 400);
  assert.equal((await call("/tasks", { method: "POST", cookie: manar, body: { kind: "photo", toUserId: bayoumiId, dueOn: "2026-02-30", unitId } })).status, 400);
});

test("the flow: Manar gives a shoot → Bayoumi told, sees the unit → In Progress → Done → Undo (M-04 7.1) — audited", async () => {
  const id = await give(manar, { kind: "photo", toUserId: bayoumiId, unitId, note: "E2E صوّرها الصبح" });
  assert.equal(await prisma.notification.count({ where: { userId: bayoumiId, link: { contains: id } } }), 1);
  const card = (await board(bayoumi)).find((t) => t.id === id) as unknown as { unit: { code: string; ownerPhone: string }; by: { name: string }; can: { moves: string[] } };
  assert.equal(card.unit.code, `U-T${stamp}`);
  assert.equal(card.unit.ownerPhone, "01000000000"); // the unit's data reaches the photographer with the task
  assert.deepEqual(card.can.moves, ["progress", "done"]);
  // Rahma sees every task of her department's photographer (4.1)
  assert.ok((await board(rahma)).some((t) => t.id === id));
  assert.equal((await call(`/tasks/${id}`, { cookie: sales })).status, 403);
  assert.equal((await move(bayoumi, id, "uploaded")).status, 400); // the Retouch lane only
  assert.equal((await move(bayoumi, id, "progress")).body.status, "progress");
  assert.equal((await move(bayoumi, id, "progress")).status, 400);
  const done = await move(bayoumi, id, "done");
  assert.equal(done.body.status, "done");
  assert.ok(done.body.doneAt);
  assert.ok(await prisma.notification.count({ where: { userId: await userId("manar.ahmed@places.com"), link: { contains: id } } })); // the one who gave it hears
  const undone = await move(bayoumi, id, "todo");
  assert.equal(undone.body.status, "todo");
  assert.equal(undone.body.doneAt, null);
  const actions = (await prisma.auditLog.findMany({ where: { entity: "Task", entityId: id }, orderBy: { at: "asc" } })).map((a) => a.action);
  assert.deepEqual(actions, ["create", "status", "status", "undo"]);
});

test("Retouch (M-04 2.2): Done only through Manar's approval; sent back → To Do and counted", async () => {
  const id = await give(manar, { kind: "retouch", toUserId: bayoumiId, unitId });
  const refused = await move(bayoumi, id, "done");
  assert.equal(refused.status, 400);
  assert.match(JSON.stringify(refused.body), /موافقة منار/);
  assert.equal((await move(bayoumi, id, "uploaded")).body.status, "uploaded");
  assert.equal((await move(bayoumi, id, "done")).status, 400);
  assert.equal((await move(rahma, id, "done")).status, 400); // Rahma doesn't approve Retouch
  const back = await move(manar, id, "todo");
  assert.equal(back.body.status, "todo");
  assert.equal(back.body.returned, 1);
  await move(bayoumi, id, "uploaded");
  assert.equal((await move(manar, id, "done")).body.status, "done");
  assert.equal((await move(bayoumi, id, "todo")).status, 400); // approved: no Undo
  assert.equal(await prisma.auditLog.count({ where: { entity: "Task", entityId: id, action: "return" } }), 1);
});

test("a marketing task from Rahma; reassigning is audited and tells the new assignee; the photographer can't reassign", async () => {
  const id = await give(rahma, { kind: "marketing", toUserId: bayoumiId, title: "Website leasing" });
  assert.equal((await call(`/tasks/${id}`, { method: "PATCH", cookie: bayoumi, body: { dueOn: "2026-12-01" } })).status, 403);
  assert.equal((await call(`/tasks/${id}`, { method: "PATCH", cookie: rahma, body: {} })).status, 400);
  const moved = await call(`/tasks/${id}`, { method: "PATCH", cookie: rahma, body: { toUserId: rahmaId, dueOn: "2026-12-01" } });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.to.id, rahmaId);
  assert.equal(moved.body.dueOn, "2026-12-01");
  assert.equal(await prisma.auditLog.count({ where: { entity: "Task", entityId: id, action: "reassign" } }), 1);
  // Bayoumi no longer has it on his board; filters by kind and assignee
  assert.ok(!(await board(bayoumi)).some((t) => t.id === id));
  assert.ok((await call(`/tasks?kind=marketing&toUserId=${rahmaId}`, { cookie: admin })).body.some((t: { id: string }) => t.id === id));
  assert.ok(!(await call(`/tasks?kind=photo`, { cookie: admin })).body.some((t: { id: string }) => t.id === id));
});
