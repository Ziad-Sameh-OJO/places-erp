/**
 * 7.4 · the Excuse (M-05, Q31): a ticket of type «excuse» to the Team Leader then HR; once HR confirms, the day shows
 * «Excuse» and costs nothing for the 1st and 2nd (half a day for the 3rd and 4th) instead of the tiers; the 5th in a
 * month is refused at once and management is alerted. The tickets screen can't decide it.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const START = new Date();
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
let mohsen: string, tl: string, basant: string, eid: string;
let mohsenEmp: string, eidEmp: string;

before(async () => {
  [mohsen, tl, basant, eid] = await Promise.all(["m.mohsen@places.com", "abdallah.sleem@places.com", "basant.elsawy@places.com", "m.eid@places.com"].map((e) => session(e)));
  mohsenEmp = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  eidEmp = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.eid@places.com" } } })).id;
  await prisma.excuseRequest.deleteMany({ where: { employeeId: { in: [mohsenEmp, eidEmp] }, day: { gte: new Date(`${today().slice(0, 7)}-01T00:00:00Z`) } } });
  await prisma.attendanceDay.deleteMany({ where: { employeeId: mohsenEmp, day: new Date(`${today()}T00:00:00Z`) } });
});
after(async () => {
  const ex = await prisma.excuseRequest.findMany({ where: { employeeId: { in: [mohsenEmp, eidEmp] }, createdAt: { gte: new Date(START.getTime() - 60_000) } } });
  const att = await prisma.attendanceDay.findMany({ where: { employeeId: mohsenEmp, day: new Date(`${today()}T00:00:00Z`) } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ex.map((x) => x.id), ...ex.map((x) => x.ticketId ?? ""), ...att.map((a) => a.id)] } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ex.map((x) => x.ticketId ?? "") } } });
  await prisma.excuseRequest.deleteMany({ where: { id: { in: ex.map((x) => x.id) } } });
  await prisma.attendanceDay.deleteMany({ where: { id: { in: att.map((a) => a.id) } } });
  await prisma.mailLog.deleteMany({ where: { text: { contains: "Excuse" }, createdAt: { gte: START } } }); // the 5th's alert to management
  await prisma.notification.deleteMany({ where: { text: { contains: "Excuse" }, createdAt: { gte: START } } });
  await prisma.$disconnect();
});

test("Excuse #1: ticket → TL → HR; the day stops being «متأخر» and costs nothing (7.4)", async () => {
  const late = await call("/hr/attendance", { method: "PUT", cookie: basant, body: { employeeId: mohsenEmp, day: today(), checkIn: "12:15" } });
  assert.equal(late.body.deduction, 1); // 12:15 = a full day by the tiers
  const r = await call("/hr/excuses", { method: "POST", cookie: mohsen, body: { day: today(), reason: "زيارة لعميل الصبح" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.number, 1);
  assert.match(r.body.ticket, /^TK-\d+$/);
  const ticket = await prisma.ticket.findFirstOrThrow({ where: { number: Number(r.body.ticket.slice(3)) } });
  assert.equal(ticket.type, "excuse");
  assert.equal(ticket.department, "HR");
  // the tickets screen can't decide it
  assert.equal((await call(`/tickets/${ticket.id}/replies`, { method: "POST", cookie: basant, body: { text: "x", status: "Resolved" } })).status, 400);
  assert.equal((await call(`/hr/excuses/${r.body.id}/approve`, { method: "POST", cookie: basant })).status, 403); // HR waits for the TL
  assert.equal((await call(`/hr/excuses/${r.body.id}/approve`, { method: "POST", cookie: tl })).body.status, "approved_tl");
  assert.equal((await call(`/hr/excuses/${r.body.id}/approve`, { method: "POST", cookie: basant })).body.status, "confirmed");
  const day = (await call(`/hr/attendance/day?day=${today()}`, { cookie: basant })).body.rows.find((x: { employeeId: string }) => x.employeeId === mohsenEmp);
  assert.deepEqual([day.label, day.deduction, day.lateMinutes], ["Excuse", 0, 59]);
  assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "Closed");
  assert.equal((await call("/hr/excuses", { method: "POST", cookie: mohsen, body: { day: today(), reason: "تاني" } })).status, 400); // one per day
});

test("the 5th Excuse in a month is refused at once and management is alerted (Q31)", async () => {
  const first = new Date(`${today().slice(0, 7)}-01T00:00:00Z`);
  const me = (await prisma.user.findUniqueOrThrow({ where: { email: "m.eid@places.com" } })).id;
  await prisma.excuseRequest.createMany({ data: [1, 2, 3, 4].map((n) => ({ employeeId: eidEmp, day: first, reason: "E2E", number: n, status: "confirmed", createdById: me })) });
  const r = await call("/hr/excuses", { method: "POST", cookie: eid, body: { day: today(), reason: "خامس" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.number, 5);
  assert.equal(r.body.status, "refused");
  assert.ok(await prisma.notification.findFirst({ where: { text: { contains: "Excuse خامس" }, createdAt: { gte: START } } }));
  assert.equal((await call("/hr/excuses", { cookie: eid })).status, 403); // HR's list
});
