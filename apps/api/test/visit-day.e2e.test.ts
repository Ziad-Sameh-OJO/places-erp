/**
 * 7.3 · the Visit as the start of a salesperson's day (4 Nov demo meeting), «نسي البصمة» (HR confirms), «شغل من بره»
 * (Head then HR) · 1.24 postponing a Visit (reason, the TL approves, no deduction) · 1.23 today's rotation order
 * (fingerprint / Visit time, by hand for today). Two salespeople of their own (the last two by name, not the ones the
 * routing tests tick), their own days and their own area; everything is put back.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { dayStart, localDate } from "@places/domain";
import { API, call, cleanLeaveNotices, mark, session } from "./helpers.ts";

const START = new Date();
const stamp = String(START.getTime());
const AREA = `E2E روتيشن ${stamp}`;
const [D1, D2, D3, D4] = ["2026-10-21", "2026-10-22", "2026-10-26", "2026-10-27"]; // working days, no holiday
const TODAY = localDate(new Date());
type Emp = { id: string; name: string; userId: string; email: string; tlEmail: string };
let x: Emp, y: Emp, xs: string, ys: string, ytl: string, hr: string, ops: string, admin: string;
const leads: string[] = [];
let savedDays: Awaited<ReturnType<typeof prisma.attendanceDay.findMany>> = [];
mark(stamp); // «Visit / Meeting معملهاش» mails name the leads

const csv = (rows: string[][]) => new Blob([["الاسم,التاريخ,الدخول,الخروج", ...rows.map((r) => r.join(","))].join("\n")]);
const upload = async (rows: string[][]) => {
  const form = new FormData();
  form.append("file", csv(rows), "fingerprint.csv");
  return (await fetch(`${API}/hr/attendance/import`, { method: "POST", body: form, headers: { cookie: hr } })).json();
};
const at = (day: string, hhmm: string) => new Date(dayStart(day).getTime() + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000);
const asDay = (d: string) => new Date(`${d}T00:00:00Z`);
async function leadWithVisit(e: Emp, day: string, hhmm: string) {
  const lead = await prisma.lead.create({ data: { code: `L-VD${stamp}${leads.length}`, name: `E2E-VD ${stamp} ${leads.length}`, phones: [`0109${stamp.slice(-6)}${leads.length}`],
    area: AREA, type: "Rent", channel: "Facebook", assignedToId: e.id, assignedAt: new Date(), createdById: "e2e", stage: "FOLLOW_UP_TO_VISIT" as never, qualified: true } });
  leads.push(lead.id);
  mark(lead.id); // «الـ Visit بتاع … اتأجل» links to it without naming it
  const v = await prisma.leadVisit.create({ data: { leadId: lead.id, kind: "visit", at: at(day, hhmm), byUserId: e.userId } });
  return { lead: lead.id, visit: v.id };
}
const dayRow = async (e: Emp, day: string) => (await call(`/hr/attendance/history?from=${day}&to=${day}&employeeId=${e.id}`, { cookie: hr })).body.rows[0];

before(async () => {
  const people = await prisma.employee.findMany({ where: { user: { status: { not: "DISABLED" }, roles: { some: { role: { key: "sales" } } } }, teamLeaderId: { not: null } },
    select: { id: true, name: true, userId: true, user: { select: { email: true } }, teamLeader: { select: { user: { select: { email: true } } } } }, orderBy: { name: "desc" }, take: 2 });
  [x, y] = people.map((p) => ({ id: p.id, name: p.name, userId: p.userId, email: p.user.email, tlEmail: p.teamLeader!.user.email }));
  [xs, ys, ytl, hr, ops, admin] = await Promise.all([x.email, y.email, y.tlEmail, "basant.elsawy@places.com", "heba.salah@places.com", "ahmed.islam@places.com"].map((m) => session(m)));
  // their real days on these dates (today is a real day) are put back at the end
  const mine = { employeeId: { in: [x.id, y.id] }, day: { in: [D1, D2, D3, D4, TODAY].map(asDay) } };
  savedDays = await prisma.attendanceDay.findMany({ where: mine });
  await prisma.attendanceDay.deleteMany({ where: mine });
  await prisma.setting.upsert({ where: { key: "areaRouting" }, update: {}, create: { key: "areaRouting", value: {} } });
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY[${AREA}], ${JSON.stringify([x.id, y.id])}::jsonb) WHERE "key" = 'areaRouting'`;
});
after(async () => {
  const days = await prisma.attendanceDay.findMany({ where: { employeeId: { in: [x.id, y.id] }, day: { in: [D1, D2, D3, D4, TODAY].map(asDay) } }, select: { id: true } });
  const asks = await prisma.leaveRequest.findMany({ where: { employeeId: x.id, reason: { contains: stamp } }, select: { id: true } });
  const visits = await prisma.leadVisit.findMany({ where: { leadId: { in: leads } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entity: "RotationOrder", at: { gte: START } }, { entityId: { in: [...days, ...asks, ...visits].map((r) => r.id) } }] } });
  await prisma.attendanceDay.deleteMany({ where: { id: { in: days.map((d) => d.id) } } });
  if (savedDays.length) await prisma.attendanceDay.createMany({ data: savedDays });
  await cleanLeaveNotices(x.id, START);
  await prisma.leaveRequest.deleteMany({ where: { id: { in: asks.map((a) => a.id) } } });
  await prisma.lead.deleteMany({ where: { OR: [{ id: { in: leads } }, { area: AREA }] } });
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = "value" - ${AREA} WHERE "key" = 'areaRouting'`;
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", '{cursor}', ("value"->'cursor') - ${AREA}) WHERE "key" = 'routing' AND "value" ? 'cursor'`;
  await prisma.setting.deleteMany({ where: { key: `rotationOrder:${TODAY}` } });
  await prisma.notification.deleteMany({ where: { OR: [{ text: { contains: `E2E-VD ${stamp}` } }, { text: { startsWith: "نسي البصمة" }, createdAt: { gte: START } }] } });
  await prisma.$disconnect();
});

test("7.3 · Visit 10:00 + fingerprint 11:40: Done = 10:00 without a deduction · «معملتهاش» = 11:40 with its deduction", async () => {
  const a = await leadWithVisit(x, D1, "10:00"), b = await leadWithVisit(y, D1, "10:00");
  assert.equal((await upload([[x.name, D1, "11:40", "19:00"], [y.name, D1, "11:40", "19:00"]])).imported, 2);
  // not marked yet: still the Visit; HR sees both times
  assert.deepEqual(Object.values((({ checkIn, visitAt, deduction, label }) => ({ checkIn, visitAt, deduction, label }))(await dayRow(x, D1))), ["11:40", "10:00", 0, "Visit"]);
  const done = await call(`/leads/${a.lead}/visits/${a.visit}/outcome`, { method: "POST", cookie: xs, body: { outcome: "done" } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.deepEqual([(await dayRow(x, D1)).deduction, (await dayRow(x, D1)).visitAt], [0, "10:00"]);
  assert.equal((await call(`/leads/${b.lead}/visits/${b.visit}/outcome`, { method: "POST", cookie: ys, body: { outcome: "not_done" } })).status, 200);
  const r = await dayRow(y, D1);
  assert.deepEqual([r.checkIn, r.deduction, r.lateMinutes, r.label], ["11:40", 0.5, 24, "Visit · معملهاش"]);
});

test("7.3 · «نسي البصمة»: only a check-out → HR is told, no deduction until she confirms; sales can't confirm", async () => {
  assert.equal((await upload([[y.name, D2, "", "19:00"]])).imported, 1);
  const r = await dayRow(y, D2);
  assert.deepEqual([r.checkIn, r.deduction, r.confirmForgot], [null, 0, true]);
  assert.ok(await prisma.notification.findFirst({ where: { text: { contains: `نسي البصمة` }, createdAt: { gte: START } } }));
  assert.equal((await call(`/hr/attendance/${r.id}/confirm-forgot`, { method: "POST", cookie: ys })).status, 403);
  const ok = await call(`/hr/attendance/${r.id}/confirm-forgot`, { method: "POST", cookie: hr });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual([ok.body.deduction, ok.body.confirmForgot, ok.body.label], [1, false, "نسي البصمة"]);
  assert.equal((await call(`/hr/attendance/${r.id}/confirm-forgot`, { method: "POST", cookie: hr })).status, 404); // once
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: r.id, action: "confirm-forgot" } }));
});

test("7.3 · «شغل من بره»: the Head approves, then HR confirms → that day without a deduction even with a late fingerprint", async () => {
  await upload([[x.name, D3, "12:10", "19:00"]]);
  assert.equal((await dayRow(x, D3)).deduction, 1);
  const ask = await call("/hr/leaves", { method: "POST", cookie: xs, body: { type: "شغل من بره", from: D3, to: D3, reason: `عند عميل ${stamp}` } });
  assert.equal(ask.status, 201, JSON.stringify(ask.body));
  assert.equal((await call(`/hr/leaves/${ask.body.id}/approve`, { method: "POST", cookie: await session(x.tlEmail) })).status, 201);
  assert.equal((await dayRow(x, D3)).deduction, 1); // the Head alone isn't enough
  assert.equal((await call(`/hr/leaves/${ask.body.id}/approve`, { method: "POST", cookie: hr })).status, 201);
  const r = await dayRow(x, D3);
  assert.deepEqual([r.deduction, r.label], [0, "شغل من بره (معتمد)"]);
});

test("1.24 · «اتأجلت»: the reason is a must · only the TL approves · approved = that day without a deduction", async () => {
  const v = await leadWithVisit(y, D4, "10:00");
  await upload([[y.name, D4, "12:10", "19:00"]]);
  const url = `/leads/${v.lead}/visits/${v.visit}/postpone`;
  assert.equal((await call(url, { method: "POST", cookie: ys, body: {} })).status, 400);
  assert.equal((await call(url, { method: "POST", cookie: ys, body: { reason: " " } })).status, 400);
  const asked = await call(url, { method: "POST", cookie: ys, body: { reason: "العميل مسافر" } });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  assert.deepEqual(asked.body.visits[0].postpone, { status: "pending", reason: "العميل مسافر", canDecide: false });
  assert.equal((await call(url, { method: "POST", cookie: ys, body: { reason: "تاني" } })).status, 400); // once
  assert.equal((await call(`/leads/${v.lead}/visits/${v.visit}/outcome`, { method: "POST", cookie: ys, body: { outcome: "done" } })).status, 400); // waiting for the TL
  // the salesperson and Operations can't approve; Operations is told
  for (const c of [ys, ops]) assert.equal((await call(`${url}/decision`, { method: "POST", cookie: c, body: { approve: true } })).status, 403);
  assert.equal((await call(`/leads/${v.lead}`, { cookie: ytl })).body.visits[0].postpone.canDecide, true);
  const ok = await call(`${url}/decision`, { method: "POST", cookie: ytl, body: { approve: true } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.visits[0].postpone.status, "approved");
  const r = await dayRow(y, D4);
  assert.deepEqual([r.deduction, r.label], [0, "Visit اتأجلت (معتمد)"]);
  assert.equal((await call(`${url}/decision`, { method: "POST", cookie: ytl, body: { approve: false } })).status, 400); // decided once
  const audits = await prisma.auditLog.findMany({ where: { entityId: v.visit }, select: { action: true } });
  assert.deepEqual(audits.map((a) => a.action).sort(), ["postpone-approve", "postpone-ask"]);
  // rejected: it must be marked Done or «معملتهاش»
  const w = await leadWithVisit(y, D4, "15:00");
  await call(`/leads/${w.lead}/visits/${w.visit}/postpone`, { method: "POST", cookie: ys, body: { reason: "زحمة" } });
  assert.equal((await call(`/leads/${w.lead}/visits/${w.visit}/postpone/decision`, { method: "POST", cookie: ytl, body: { approve: false } })).status, 200);
  assert.equal((await call(`/leads/${w.lead}/visits/${w.visit}/outcome`, { method: "POST", cookie: ys, body: { outcome: "done" } })).status, 200);
});

test("1.23 · today's rotation: the fingerprint / Visit decides, by hand for today only, the next lead goes to the first", async () => {
  assert.equal((await call("/leads/rotation", { cookie: ys })).status, 403);
  assert.equal((await call("/leads/rotation", { method: "PUT", cookie: ops, body: { ids: [x.id, y.id] } })).status, 403);
  // y fingerprinted, x didn't yet → y first
  await prisma.attendanceDay.create({ data: { employeeId: y.id, day: asDay(TODAY), checkInAt: at(TODAY, "10:30"), source: "sheet" } });
  const view = (await call("/leads/rotation", { cookie: admin })).body;
  const mine = (v: { people: { id: string }[] }) => v.people.map((p) => p.id).filter((id) => id === x.id || id === y.id);
  assert.deepEqual(mine(view), [y.id, x.id]);
  assert.equal(view.people.find((p: { id: string }) => p.id === y.id).start, "10:30");
  const newLead = async (n: number) => {
    await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", '{cursor}', ("value"->'cursor') - ${AREA}) WHERE "key" = 'routing' AND "value" ? 'cursor'`; // the area's first lead today
    const r = await call("/leads", { method: "POST", cookie: admin, body: { name: `E2E-VD ${stamp} R${n}`, phones: [`0127${stamp.slice(-6)}${n}`], area: AREA, type: "Rent", channel: "Facebook" } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.assignedTo.id;
  };
  assert.equal(await newLead(1), y.id);
  // by hand: x first, for today
  const set = await call("/leads/rotation", { method: "PUT", cookie: admin, body: { ids: [x.id, y.id] } });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.manual, true);
  assert.deepEqual(mine(set.body), [x.id, y.id]);
  assert.equal(await newLead(2), x.id);
  assert.ok(await prisma.setting.findUnique({ where: { key: `rotationOrder:${TODAY}` } })); // a key of today's: tomorrow is automatic again
  assert.equal((await call("/leads/rotation", { method: "PUT", cookie: admin, body: { ids: [x.id, "nobody"] } })).status, 400);
  const back = await call("/leads/rotation", { method: "DELETE", cookie: admin });
  assert.equal(back.body.manual, false);
  assert.deepEqual(mine(back.body), [y.id, x.id]);
  assert.deepEqual((await prisma.auditLog.findMany({ where: { entity: "RotationOrder", at: { gte: START } }, select: { action: true }, orderBy: { at: "asc" } })).map((a) => a.action), ["update", "reset"]);
});
