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
  const r = await call("/tasks", { method: "POST", cookie, body: { dueOn: today, note: "E2E الدور التالت · الأمن هيفتح", ...body } });
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
  // the form's unit search (4.2): a new unit is shot before its PDF is confirmed, so drafts are in
  const found = (await call(`/tasks/units?q=U-T${stamp}`, { cookie: manar })).body as Array<{ id: string }>;
  assert.deepEqual(found.map((u) => u.id), [unitId]);
  assert.equal((await call(`/tasks/units?q=x`, { cookie: bayoumi })).status, 403);
  const opts = (await call("/tasks/options", { cookie: rahma })).body;
  assert.ok(opts.marketingTypes.includes("Website leasing"));
  assert.equal((await call("/tasks", { method: "POST", cookie: rahma, body: { kind: "photo", toUserId: bayoumiId, dueOn: today, unitId } })).status, 403);
  assert.equal((await call("/tasks", { method: "POST", cookie: manar, body: { kind: "photo", toUserId: rahmaId, dueOn: today, unitId } })).status, 400); // not a photographer
  assert.equal((await call("/tasks", { method: "POST", cookie: manar, body: { kind: "photo", toUserId: bayoumiId, dueOn: today } })).status, 400); // no unit
  assert.equal((await call("/tasks", { method: "POST", cookie: manar, body: { kind: "followup", toUserId: randaId, dueOn: today, unitId } })).status, 400); // the system's
  assert.equal((await call("/tasks", { method: "POST", cookie: rahma, body: { kind: "marketing", toUserId: bayoumiId, dueOn: today, title: "مش في القايمة" } })).status, 400);
  assert.equal((await call("/tasks", { method: "POST", cookie: manar, body: { kind: "photo", toUserId: bayoumiId, dueOn: "2026-02-30", unitId } })).status, 400);
  // 4.16: the notes are all that reaches the photographer, so a shoot, a Retouch or a hand-off without them is refused
  for (const [kind, to] of [["photo", bayoumiId], ["retouch", bayoumiId], ["toResale", randaId]] as const) {
    const r = await call("/tasks", { method: "POST", cookie: manar, body: { kind, toUserId: to, dueOn: today, unitId, note: "  " } });
    assert.equal(r.status, 400, kind);
  }
});

test("the flow: Manar gives a shoot → Bayoumi told, sees the unit → In Progress → Done → Undo (M-04 7.1) — audited", async () => {
  const id = await give(manar, { kind: "photo", toUserId: bayoumiId, unitId, note: "E2E صوّرها الصبح" });
  assert.equal(await prisma.notification.count({ where: { userId: bayoumiId, link: { contains: id } } }), 1);
  const card = (await board(bayoumi)).find((t) => t.id === id) as unknown as { unit: Record<string, unknown>; note: string; by: { name: string }; can: { moves: string[] } };
  // 4.16: the photographer gets the unit's code and Manar's notes only — never the owner, his number or the place
  assert.deepEqual([card.unit.code, card.unit.project, card.unit.area, card.unit.floor, card.unit.building, card.unit.ownerName, card.unit.ownerPhone], [`U-T${stamp}`, "", "", null, null, null, null]);
  assert.equal(card.note, "E2E صوّرها الصبح");
  assert.equal((await call(`/tasks/${id}`, { cookie: bayoumi })).body.unit.ownerPhone, null);
  const told = await prisma.notification.findFirstOrThrow({ where: { userId: bayoumiId, link: { contains: id } } });
  assert.ok(told.text.includes(`U-T${stamp}`) && !told.text.includes("01000000000") && !told.text.includes("مالك تجربة"));
  assert.deepEqual(card.can.moves, ["progress", "done"]);
  // Rahma sees every task of her department's photographer (4.1), but not the owner's number (M-10 4.1); Manar keeps the inventory
  const seen = (await board(rahma)).find((t) => t.id === id) as unknown as { unit: { ownerPhone: string | null } } | undefined;
  assert.ok(seen);
  assert.equal(seen.unit.ownerPhone, null);
  assert.equal(((await board(manar)).find((t) => t.id === id) as unknown as { unit: { ownerPhone: string } }).unit.ownerPhone, "01000000000");
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

test("SLA (4.3 · M-12): a shoot 72 h from the unit's registration, a Retouch 48 h; the notices; the month's report", async () => {
  await prisma.unit.update({ where: { id: unitId }, data: { enteredAt: new Date(Date.now() - 80 * 3_600_000) } }); // registered 80 h ago
  const shoot = await give(manar, { kind: "photo", toUserId: bayoumiId, unitId });
  const card = (await call(`/tasks/${shoot}`, { cookie: bayoumi })).body;
  assert.ok(card.sla.hoursLeft <= -8 && card.sla.hoursLeft >= -9, JSON.stringify(card.sla)); // 8 h past the 72
  assert.equal(card.sla.met, null);
  assert.equal((await move(bayoumi, shoot, "done")).body.sla.met, false);
  const heard = async (email: string, id: string, text: string) =>
    prisma.notification.count({ where: { userId: await userId(email), link: { contains: id }, text: { contains: text } } });
  assert.equal(await heard("rahma.hassan@places.com", shoot, "خلّص تصوير"), 1);

  const retouch = await give(manar, { kind: "retouch", toUserId: bayoumiId, unitId });
  const r = (await call(`/tasks/${retouch}`, { cookie: bayoumi })).body;
  assert.ok(r.sla.hoursLeft >= 47 && r.sla.hoursLeft <= 48, JSON.stringify(r.sla));
  await move(bayoumi, retouch, "uploaded");
  assert.equal(await heard("manar.ahmed@places.com", retouch, "محتاجة موافقتك"), 1);
  assert.equal((await move(manar, retouch, "done")).body.sla.met, true);
  assert.equal(await heard("rahma.hassan@places.com", retouch, "اتوافق عليه"), 1);

  const report = await call("/tasks/sla", { cookie: bayoumi });
  assert.equal(report.status, 200, JSON.stringify(report.body));
  assert.ok(report.body.photo.total >= 1 && report.body.photo.met < report.body.photo.total); // this month's late shoot counts against
  assert.ok(report.body.retouch.met >= 1 && report.body.firstTime.met >= 1);
  assert.equal((await call("/tasks/sla?month=2026-13", { cookie: bayoumi })).status, 400);
  assert.equal((await call("/tasks/sla", { cookie: sales })).status, 403);
});

test("M-04 2.1 step 4 «وحدة في اليوم»: Randa's second shoot for Bayoumi the same day is sent with the demo's warning", async () => {
  // a day nobody else uses, so other files' shoots don't count
  const day = new Date(Date.UTC(2031, 0, 1) + (Date.now() % 1000) * 86_400_000).toISOString().slice(0, 10);
  const send = async (body: Record<string, unknown>) => {
    const r = await call("/tasks", { method: "POST", cookie: randa, body: { kind: "photo", toUserId: bayoumiId, dueOn: day, unitId, note: "E2E", ...body } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    tasks.push(r.body.id);
    return r.body as { id: string; warning: string | null };
  };
  const first = await send({});
  assert.equal(first.warning, null);
  assert.equal((await send({})).warning, "تنبيه: إنت مدياه وحدة النهارده قبل كده (وحدة في اليوم)");
  assert.equal((await send({ kind: "retouch" })).warning, null); // the rule is the shoots'
  // Manar's one for the day is hers: «كل واحدة بتديله وحدة»
  const manars = await call("/tasks", { method: "POST", cookie: manar, body: { kind: "photo", toUserId: bayoumiId, dueOn: day, unitId, note: "E2E" } });
  tasks.push(manars.body.id);
  assert.equal(manars.body.warning, null);
});

test("2.30 the unit drawer's «المهام»: GET /tasks?unitId= gives that unit's tasks only, in the caller's scope", async () => {
  const other = (await prisma.unit.create({ data: { code: `U-T${stamp}b`, type: "Rent", project: `مشروع ${stamp}`, area: "التجمع الخامس", space: 300, condition: "Finished" } })).id;
  try {
    const here = await give(manar, { kind: "retouch", toUserId: bayoumiId, unitId });
    const there = await give(manar, { kind: "photo", toUserId: bayoumiId, unitId: other });
    const of = async (cookie: string, id: string) => (await call(`/tasks?unitId=${id}`, { cookie })).body as Array<{ id: string; unit: { id: string } }>;
    const mine = await of(manar, unitId);
    assert.ok(mine.some((t) => t.id === here));
    assert.ok(mine.every((t) => t.unit.id === unitId));
    assert.deepEqual((await of(manar, other)).map((t) => t.id), [there]);
    assert.deepEqual((await of(bayoumi, other)).map((t) => t.id), [there]); // the photographer sees his own
    assert.equal((await call(`/tasks?unitId=${other}`, { cookie: sales })).status, 403);
  } finally {
    await prisma.notification.deleteMany({ where: { OR: tasks.map((id) => ({ link: { contains: id } })) } });
    await prisma.task.deleteMany({ where: { unitId: other } });
    await prisma.unit.delete({ where: { id: other } });
  }
});

test("4.14 the board's sides: Manar's task for Randa is «مهام الفريق», her shoot for Bayoumi «مهام لناس خارجية»", async () => {
  const r = await call("/inventory/team-tasks", { method: "POST", cookie: manar, body: { toUserId: randaId, title: `ابديت ${stamp}` } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const team = r.body.id as string;
  tasks.push(team);
  const shoot = await give(manar, { kind: "photo", toUserId: bayoumiId, unitId, note: "الدور التالت" });
  const side = async (scope: string) => ((await call(`/tasks?scope=${scope}`, { cookie: manar })).body as Array<{ id: string; side: string }>);
  const teams = await side("team"), outside = await side("outside");
  assert.ok(teams.some((t) => t.id === team) && !teams.some((t) => t.id === shoot));
  assert.ok(outside.some((t) => t.id === shoot) && !outside.some((t) => t.id === team));
  assert.ok(teams.every((t) => t.side === "team") && outside.every((t) => t.side === "outside"));
  // Rahma (Marketing) sees the same shoot as outside too: the side is the task's, not the viewer's
  assert.equal((await board(rahma) as Array<{ id: string; side?: string }>).find((t) => t.id === shoot)?.side, "outside");
  assert.equal((await call("/tasks?scope=nope", { cookie: manar })).status, 400);
  assert.equal((await call("/tasks?scope=team", { cookie: sales })).status, 403);
});

test("4.15 «تتحسب في الـ KPIs؟»: Skip by default; «أيوه» adds «المهام في ميعادها» to the assignee's card with weight 0, once", async () => {
  const q = await prisma.kpiQuarter.findFirst({ orderBy: { id: "desc" } });
  assert.equal(q?.status, "open", "the seed opens the current quarter");
  const emp = await prisma.employee.findUniqueOrThrow({ where: { userId: bayoumiId } });
  const before = await prisma.kpiCard.findUnique({ where: { quarter_employeeId: { quarter: q!.id, employeeId: emp.id } }, include: { items: true } });
  const items = () => prisma.kpiItem.findMany({ where: { metric: "tasksOnTime", card: { quarter: q!.id, employeeId: emp.id } } });
  try {
    const send = async (body: Record<string, unknown>) => {
      const r = await call("/tasks", { method: "POST", cookie: rahma, body: { kind: "marketing", toUserId: bayoumiId, dueOn: today, title: (await call("/tasks/options", { cookie: rahma })).body.marketingTypes[0], ...body } });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      tasks.push(r.body.id);
      return r.body as { id: string; kpi: string | null };
    };
    const skip = await send({});
    assert.equal(skip.kpi, null);
    assert.equal((await call(`/tasks/${skip.id}`, { cookie: rahma })).body.countsInKpi, false);
    assert.equal((await items()).length, before?.items.some((i) => i.metric === "tasksOnTime") ? 1 : 0);

    const yes = await send({ countsInKpi: true });
    assert.equal(yes.kpi, before ? "item" : "card");
    assert.equal((await call(`/tasks/${yes.id}`, { cookie: rahma })).body.countsInKpi, true);
    const [item] = await items();
    assert.equal(item?.weight, 0);
    assert.equal(item?.method, "system");
    assert.equal((await send({ countsInKpi: true })).kpi, "counted");
    assert.equal((await items()).length, 1); // the second «أيوه» doesn't add it again
    const card = await prisma.kpiCard.findUniqueOrThrow({ where: { quarter_employeeId: { quarter: q!.id, employeeId: emp.id } } });
    if (!before) assert.equal(card.followerId, (await prisma.employee.findUniqueOrThrow({ where: { userId: rahmaId } })).id); // same department: Rahma follows
    assert.ok(await prisma.auditLog.findFirst({ where: { module: "kpis", entityId: card.id, after: { path: ["summary"], string_contains: "المهام في ميعادها" } } }));
  } finally {
    if (before) await prisma.kpiItem.deleteMany({ where: { cardId: before.id, metric: "tasksOnTime", id: { notIn: before.items.map((i) => i.id) } } });
    else await prisma.kpiCard.deleteMany({ where: { quarter: q!.id, employeeId: emp.id } });
  }
});
