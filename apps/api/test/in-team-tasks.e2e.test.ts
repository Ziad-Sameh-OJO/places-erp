/**
 * 14.15 · a task inside the team (management meeting, 15 Nov): the department, the task's text, a unit only if it's
 * about one, a deadline, and «تتحسب في الـ KPIs؟». Rahma gives Bayoumi (both Marketing) one; a person of another
 * department needs a ticket (#532), not a task; the Super Admin picks any department; a salesperson has no tasks.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = Date.now().toString(36);
let admin: string, manar: string, rahma: string, bayoumi: string, sales: string;
let bayoumiId: string, saraId: string, marwaId: string, unitId: string;
const tasks: string[] = [];
const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }); // the API's day (a past one is refused)
const departments = async (cookie: string) =>
  (await call("/tasks/options", { cookie })).body.departments as Array<{ name: string; people: Array<{ id: string }> }>;

before(async () => {
  [admin, manar, rahma, bayoumi, sales] = await Promise.all(
    ["ahmed.islam@places.com", "manar.ahmed@places.com", "rahma.hassan@places.com", "abdelrahman.bayoumi@places.com", "anas@places.com"].map((e) => session(e)),
  );
  [bayoumiId, saraId, marwaId] = await Promise.all(["abdelrahman.bayoumi@places.com", "sara.abdelhalim@places.com", "marwa.mostafa@places.com"].map(userId));
  unitId = (await prisma.unit.create({ data: { code: `U-IT${stamp}`, type: "Rent", project: `مشروع ${stamp}`, area: "التجمع الخامس", space: 300, condition: "Finished", ownerName: "مالك تجربة", ownerPhone: "01000000000" } })).id;
});

after(async () => {
  await prisma.notification.deleteMany({ where: { OR: tasks.map((id) => ({ link: { contains: id } })) } });
  await prisma.task.deleteMany({ where: { id: { in: tasks } } });
  await prisma.unit.deleteMany({ where: { code: `U-IT${stamp}` } });
  await prisma.$disconnect();
});

const send = (cookie: string, body: Record<string, unknown>) => call("/tasks", { method: "POST", cookie, body: { kind: "inTeam", dueOn: today, ...body } });

test("without «tasks: create»: no in-team task (a salesperson, the photographer)", async () => {
  assert.equal((await send(sales, { toUserId: bayoumiId, title: "x" })).status, 403);
  assert.equal((await send(bayoumi, { toUserId: bayoumiId, title: "x" })).status, 403);
  assert.equal((await call("/tasks/options", { cookie: bayoumi })).status, 403);
});

test("the departments: Rahma her own team only; the Super Admin any department", async () => {
  const mine = await departments(rahma);
  assert.deepEqual(mine.map((d) => d.name), ["Marketing"]);
  assert.ok(mine[0]!.people.some((p) => p.id === bayoumiId));
  const rahmaId = await userId("rahma.hassan@places.com");
  assert.ok(!mine[0]!.people.some((p) => p.id === rahmaId)); // never herself
  const all = (await departments(admin)).map((d) => d.name);
  assert.ok(["Marketing", "Inventory", "المبيعات"].every((d) => all.includes(d)), all.join());
  assert.ok((await call("/tasks/options", { cookie: rahma })).body.kinds.some((k: { key: string }) => k.key === "inTeam"));
});

test("the flow: Rahma → Bayoumi without a unit, with a deadline; told; audited; on «مهام الفريق»", async () => {
  const r = await send(rahma, { department: "Marketing", toUserId: bayoumiId, title: `بوست الويك إند ${stamp}`, dueOn: "2031-12-31" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tasks.push(r.body.id);
  const t = await prisma.task.findUniqueOrThrow({ where: { id: r.body.id } });
  assert.equal(t.unitId, null); // «مهمة من غير وحدة بتتحفظ»
  assert.equal(t.title, `بوست الويك إند ${stamp}`);
  assert.equal(t.dueOn.toISOString().slice(0, 10), "2031-12-31");
  assert.equal(t.countsInKpi, false); // Skip unless «أيوه»
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "tasks", entityId: t.id, action: "create" } }));
  assert.ok(await prisma.notification.findFirst({ where: { userId: bayoumiId, link: { contains: t.id }, text: { contains: `بوست الويك إند ${stamp}` } } }));
  const row = (await call(`/tasks/${t.id}`, { cookie: bayoumi })).body;
  assert.equal(row.side, "team");
  assert.equal(row.kindLabel, "مهمة جوه التيم");
  assert.equal((await call(`/tasks/${t.id}/status`, { method: "POST", cookie: bayoumi, body: { status: "done" } })).status, 200);
});

test("a unit when it's about one; the text is required; another department's person is a ticket, not a task", async () => {
  // Manar's in-team task for Sara with a unit, Skip in the KPIs
  const r = await send(manar, { toUserId: saraId, title: `كلمي المالك ${stamp}`, unitId });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tasks.push(r.body.id);
  const t = await prisma.task.findUniqueOrThrow({ where: { id: r.body.id } });
  assert.equal(t.unitId, unitId);
  assert.equal(t.countsInKpi, false);
  assert.equal(r.body.kpi, null);

  assert.equal((await send(manar, { toUserId: saraId })).status, 400); // no text
  assert.equal((await send(manar, { toUserId: saraId, title: "x", unitId: "nope-unit" })).status, 400);
  const outside = await send(rahma, { toUserId: saraId, title: "x" }); // Sara is Inventory
  assert.equal(outside.status, 400);
  assert.match(outside.body.error, /تذكرة/);
  assert.equal((await send(rahma, { department: "Inventory", toUserId: bayoumiId, title: "x" })).status, 400); // he isn't of it
  // the Super Admin picks the department: Sara in Inventory is fine for him
  const a = await send(admin, { department: "Inventory", toUserId: saraId, title: `من الإدارة ${stamp}` });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  tasks.push(a.body.id);
});

test("«تتحسب في الـ KPIs؟ أيوه»: the in-team task feeds the assignee's «المهام في ميعادها» like any task (4.15)", async () => {
  const q = await prisma.kpiQuarter.findFirst({ orderBy: { id: "desc" } });
  const emp = await prisma.employee.findUniqueOrThrow({ where: { userId: marwaId } });
  const before = await prisma.kpiCard.findUnique({ where: { quarter_employeeId: { quarter: q!.id, employeeId: emp.id } }, include: { items: true } });
  try {
    const r = await send(manar, { department: "Inventory", toUserId: marwaId, title: `جرد ${stamp}`, countsInKpi: true });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    tasks.push(r.body.id);
    assert.ok(["card", "item", "counted"].includes(r.body.kpi), String(r.body.kpi));
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: r.body.id } })).countsInKpi, true);
    const items = await prisma.kpiItem.findMany({ where: { metric: "tasksOnTime", card: { quarter: q!.id, employeeId: emp.id } } });
    assert.ok(items.some((i) => !(i.params as { tkind?: string } | null)?.tkind));
  } finally {
    if (before) await prisma.kpiItem.deleteMany({ where: { cardId: before.id, id: { notIn: before.items.map((i) => i.id) } } });
    else await prisma.kpiCard.deleteMany({ where: { quarter: q!.id, employeeId: emp.id } });
  }
});
