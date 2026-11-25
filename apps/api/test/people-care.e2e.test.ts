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
const P = `E2E care ${START.getTime()}`; // own word: files start in the same millisecond
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
  await prisma.employeeDocument.deleteMany({ where: { refId: { in: ones } } }); // each 1-to-1's PDF sheet
  await prisma.setting.deleteMany({ where: { key: "hr.oneQuestions" } });
  await prisma.notification.deleteMany({ where: { text: { contains: P }, createdAt: { gte: START } } });
  await prisma.$disconnect();
});

test("HR records a penalty: approved at once; a TL proposes for his team only and HR decides (7.7)", async () => {
  const hr = await call("/hr/penalties", { method: "POST", cookie: basant, body: { employeeId: nancy, day: today(), type: "سلوك", text: `${P} تأخير في تسليم الشيت`, deductionDays: 0.5 } });
  assert.equal(hr.status, 201, JSON.stringify(hr.body));
  assert.equal(hr.body.status, "approved");
  assert.equal((await call("/hr/penalties", { method: "POST", cookie: tl, body: { employeeId: nancy, day: today(), type: "سلوك", text: `${P} برا الفريق` } })).status, 404); // not his team
  const prop = await call("/hr/penalties", { method: "POST", cookie: tl, body: { employeeId: mohsen, day: today(), type: "سلوك", text: `${P} مشاداة مع عميل`, deductionDays: 1 } });
  assert.equal(prop.body.status, "pending");
  assert.equal((await call(`/hr/penalties/${prop.body.id}/approve`, { method: "POST", cookie: tl })).status, 403);
  assert.equal((await call(`/hr/penalties/${prop.body.id}/approve`, { method: "POST", cookie: basant })).body.status, "approved");
  // by id, not the month's count: payroll.e2e records approved penalties at the same time (7.9)
  const list = (await call("/hr/penalties", { cookie: basant })).body;
  assert.equal(list.items.find((x: { id: string }) => x.id === prop.body.id).status, "approved");
  assert.equal((await call("/hr/penalties", { method: "POST", cookie: basant, body: { employeeId: nancy, day: today(), type: "سلوك", text: `${P} x`, deductionDays: 0.3 } })).status, 400);
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
  // 7.15: the employees list shows «آخر 1-to-1» and the open «حل HR», red on its day; sales can't see the list
  type Row = { id: string; lastOneOnOne: string | null; hrAction: { due: string; overdue: boolean } | null };
  const row = async () => ((await call("/hr/employees", { cookie: basant })).body.items as Row[]).find((e) => e.id === mohsen)!;
  let listed = await row();
  assert.equal(listed.lastOneOnOne, today());
  assert.deepEqual(listed.hrAction, { due: today(), overdue: true });
  assert.equal((await call("/hr/employees", { cookie: sales })).status, 403);
  assert.equal((await call(`/hr/one-on-one/${r.body.id}/done`, { method: "POST", cookie: basant })).status, 201);
  assert.ok(!(await call("/hr/one-on-one/actions", { cookie: basant })).body.items.some((x: { id: string }) => x.id === r.body.id));
  listed = await row();
  assert.equal(listed.hrAction, null); // done → off the list
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
    // admin review: the questions are company-wide, HR's like the deduction rules
    assert.equal((await call("/hr/one-on-one/questions", { method: "PUT", cookie, body: { questions: ["سؤال من برا الـ HR"] } })).status, 403);
    assert.equal(await prisma.oneOnOne.count({ where: { byUserId: u.id } }), 0);
    // review S4: «حل الـ HR» list is in scope too — HR sees Mohsen's open action, the team-scope account doesn't
    const one = await call(`/hr/employees/${mohsen}/one-on-one`, { method: "POST", cookie: basant, body: { heldOn: today(), answers: {}, hrAction: `${P} حل سري`, hrActionDue: today() } });
    assert.equal(one.status, 201, JSON.stringify(one.body));
    assert.ok((await call("/hr/one-on-one/actions", { cookie: basant })).body.items.some((x: { id: string }) => x.id === one.body.id));
    const mine = await call("/hr/one-on-one/actions", { cookie });
    assert.equal(mine.status, 200);
    assert.ok(!mine.body.items.some((x: { id: string }) => x.id === one.body.id));
  } finally {
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: u.id }, { entityId: u.id }] } });
    await prisma.user.delete({ where: { id: u.id } });
  }
});

test("admin review: a TL doesn't read his own 1-to-1s nor confirm «نسي البصمة»; a penalty decided twice at once lands once", async () => {
  const own = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "abdallah.sleem@places.com" } } })).id;
  assert.equal((await call(`/hr/employees/${own}/one-on-one`, { cookie: tl })).status, 404);
  assert.equal((await call(`/hr/employees/${mohsen}/one-on-one`, { cookie: tl })).status, 200); // his team's still
  assert.equal((await call(`/hr/employees/${own}/one-on-one`, { cookie: basant })).status, 200);

  const day = new Date("2001-01-02T00:00:00Z");
  const forgot = await prisma.attendanceDay.create({ data: { employeeId: mohsen, day, kind: "FORGOT", source: "sheet", checkOutAt: new Date("2001-01-02T16:00:00Z") } });
  try {
    assert.equal((await call(`/hr/attendance/${forgot.id}/confirm-forgot`, { method: "POST", cookie: tl })).status, 403);
    assert.equal(Number((await prisma.attendanceDay.findUniqueOrThrow({ where: { id: forgot.id } })).deduction), 0);
    const ok = await call(`/hr/attendance/${forgot.id}/confirm-forgot`, { method: "POST", cookie: basant });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.deduction, 1);
  } finally {
    await prisma.auditLog.deleteMany({ where: { entityId: forgot.id } });
    await prisma.attendanceDay.delete({ where: { id: forgot.id } });
  }

  const prop = await call("/hr/penalties", { method: "POST", cookie: tl, body: { employeeId: mohsen, day: today(), type: "سلوك", text: `${P} سباق`, deductionDays: 0.5 } });
  assert.equal(prop.body.status, "pending");
  const both = await Promise.all([`/hr/penalties/${prop.body.id}/approve`, `/hr/penalties/${prop.body.id}/reject`].map((p) => call(p, { method: "POST", cookie: basant })));
  assert.equal(both.filter((r) => r.status === 201).length, 1, JSON.stringify(both.map((r) => r.body)));
  assert.equal(await prisma.auditLog.count({ where: { entity: "Penalty", entityId: prop.body.id, action: { in: ["approve", "reject"] } } }), 1);
});
