/**
 * 7.7 · penalties and 7.8 · the 1-to-1 (M-05): HR records a penalty (approved at once, with its deduction); a Team
 * Leader proposes one for his team only, and it counts only after HR approves; nobody records one on himself. The 1-to-1
 * uses HR's questions, «حل الـ HR» needs a due date, the last session comes first, and the month's session is due until held.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { hash } from "@node-rs/argon2";
import { PW, call, session } from "./helpers.ts";

const START = new Date();
const P = `E2E ${START.getTime()}`;
let basant: string, tl: string, sales: string;
let mohsen: string, nancy: string;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

before(async () => {
  [basant, tl, sales] = await Promise.all(["basant.elsawy@places.com", "abdallah.sleem@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  mohsen = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  nancy = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "nancy.islam@places.com" } } })).id;
});
after(async () => {
  const pens = (await prisma.penalty.findMany({ where: { text: { startsWith: P } }, select: { id: true } })).map((p) => p.id);
  const ones = (await prisma.oneOnOne.findMany({ where: { createdAt: { gte: START }, employeeId: { in: [mohsen, nancy] } }, select: { id: true } })).map((o) => o.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...pens, ...ones] } }, { entity: "Setting", entityId: "hr.oneQuestions", at: { gte: START } }] } });
  await prisma.penalty.deleteMany({ where: { id: { in: pens } } });
  await prisma.oneOnOne.deleteMany({ where: { id: { in: ones } } });
  await prisma.setting.deleteMany({ where: { key: "hr.oneQuestions" } });
  await prisma.notification.deleteMany({ where: { text: { contains: P }, createdAt: { gte: START } } });
  await prisma.$disconnect();
});

test("HR records a penalty: approved at once; a TL proposes for his team only and HR decides (7.7)", async () => {
  const hr = await call("/hr/penalties", { method: "POST", cookie: basant, body: { employeeId: nancy, day: today(), text: `${P} تأخير في تسليم الشيت`, deductionDays: 0.5 } });
  assert.equal(hr.status, 201, JSON.stringify(hr.body));
  assert.equal(hr.body.status, "approved");
  assert.equal((await call("/hr/penalties", { method: "POST", cookie: tl, body: { employeeId: nancy, day: today(), text: `${P} برا الفريق` } })).status, 404); // not his team
  const prop = await call("/hr/penalties", { method: "POST", cookie: tl, body: { employeeId: mohsen, day: today(), text: `${P} مشاداة مع عميل`, deductionDays: 1 } });
  assert.equal(prop.body.status, "pending");
  assert.equal((await call(`/hr/penalties/${prop.body.id}/approve`, { method: "POST", cookie: tl })).status, 403);
  let list = (await call("/hr/penalties", { cookie: basant })).body;
  const before = list.totals.approved;
  assert.equal((await call(`/hr/penalties/${prop.body.id}/approve`, { method: "POST", cookie: basant })).body.status, "approved");
  list = (await call("/hr/penalties", { cookie: basant })).body;
  assert.equal(list.totals.approved, before + 1);
  assert.equal((await call("/hr/penalties", { method: "POST", cookie: basant, body: { employeeId: nancy, day: today(), text: `${P} x`, deductionDays: 0.3 } })).status, 400);
  assert.equal((await call("/hr/penalties", { cookie: sales })).status, 403);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Penalty", entityId: prop.body.id, action: "approve" } }));
});

test("the 1-to-1: HR's questions, the last session first, «حل الـ HR» with a due date, due until this month's is held (7.8)", async () => {
  assert.equal((await call("/hr/one-on-one/questions", { method: "PUT", cookie: basant, body: { questions: ["محتاج تدريب في إيه؟", `${P} سؤال`] } })).status, 200);
  let v = (await call(`/hr/employees/${mohsen}/one-on-one`, { cookie: basant })).body;
  assert.deepEqual(v.questions, ["محتاج تدريب في إيه؟", `${P} سؤال`]);
  const answers = { "محتاج تدريب في إيه؟": "Negotiation" };
  assert.equal((await call(`/hr/employees/${mohsen}/one-on-one`, { method: "POST", cookie: basant, body: { heldOn: today(), answers, hrAction: `${P} كورس` } })).status, 400); // no due date
  const r = await call(`/hr/employees/${mohsen}/one-on-one`, { method: "POST", cookie: basant, body: { heldOn: today(), answers, hrAction: `${P} كورس`, hrActionDue: today() } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  v = (await call(`/hr/employees/${mohsen}/one-on-one`, { cookie: basant })).body;
  assert.equal(v.due, false);
  assert.equal(v.items[0].id, r.body.id);
  assert.ok((await call("/hr/one-on-one/actions", { cookie: basant })).body.items.some((x: { id: string }) => x.id === r.body.id));
  assert.equal((await call(`/hr/one-on-one/${r.body.id}/done`, { method: "POST", cookie: basant })).status, 201);
  assert.ok(!(await call("/hr/one-on-one/actions", { cookie: basant })).body.items.some((x: { id: string }) => x.id === r.body.id));
  assert.equal((await call(`/hr/employees/${mohsen}/one-on-one`, { method: "POST", cookie: tl, body: { heldOn: today(), answers } })).status, 403);
});

test("an «hr: edit» exception on a team-scope account doesn't reach people outside the team (13.3)", async () => {
  // its own account, so the shared Team Leader's permissions don't change under the other test files
  const email = `scope-${START.getTime()}@places.test`;
  const tlRole = await prisma.role.findUniqueOrThrow({ where: { key: "tl" } });
  const u = await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: { roleId: tlRole.id, primary: true } }, overrides: { create: { module: "hr", actions: ["view", "edit"] } } } });
  try {
    const cookie = await session(email);
    assert.equal((await call(`/hr/employees/${mohsen}/one-on-one`, { method: "POST", cookie, body: { heldOn: today(), answers: {} } })).status, 404);
    assert.equal(await prisma.oneOnOne.count({ where: { byUserId: u.id } }), 0);
  } finally {
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: u.id }, { entityId: u.id }] } });
    await prisma.user.delete({ where: { id: u.id } });
  }
});
