/**
 * 7.5 · 7.6 · leaves (M-05): Mohamed Mohsen asks → his Team Leader (Abdallah Sleem) approves → HR (Basant) records;
 * nobody else decides in his place; the TL's rejection is final with its reason; balances (annual from the file);
 * annual before the leave, sick after return with a document; no two requests on the same days; the calendar and the
 * monthly balances report (with export). Sales get 403 on HR's list.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const START = new Date();
let mohsen: string, tlA: string, tlB: string, basant: string;
let employeeId: string;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const plus = (n: number) => { const d = new Date(`${today()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

before(async () => {
  [mohsen, tlA, tlB, basant] = await Promise.all(["m.mohsen@places.com", "abdallah.sleem@places.com", "mahmoud.ali@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  employeeId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  await prisma.leaveRequest.deleteMany({ where: { employeeId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
});
after(async () => {
  const ids = (await prisma.leaveRequest.findMany({ where: { employeeId, createdAt: { gte: START } }, select: { id: true } })).map((r) => r.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.leaveRequest.deleteMany({ where: { id: { in: ids } } });
  await prisma.notification.deleteMany({ where: { text: { contains: "إجازة" }, createdAt: { gte: START } } });
  await prisma.$disconnect();
});

test("ask → the TL approves (nobody else can) → HR records; the balance goes down (7.5)", async () => {
  const before = (await call("/hr/leaves/mine", { cookie: mohsen })).body.balances.find((b: { type: string }) => b.type === "سنوية");
  const r = await call("/hr/leaves", { method: "POST", cookie: mohsen, body: { type: "سنوية", from: plus(7), to: plus(9), reason: "سفر" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.days, 3);
  assert.equal(r.body.status, "PENDING_TL");
  assert.equal((await call(`/hr/leaves/${r.body.id}/approve`, { method: "POST", cookie: basant })).status, 403); // HR waits for the TL
  assert.equal((await call(`/hr/leaves/${r.body.id}/approve`, { method: "POST", cookie: tlB })).status, 403); // another team's TL
  const a = await call(`/hr/leaves/${r.body.id}/approve`, { method: "POST", cookie: tlA });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.status, "APPROVED_BY_TL");
  assert.equal((await call(`/hr/leaves/${r.body.id}/approve`, { method: "POST", cookie: tlA })).status, 403); // HR's turn now
  const c = await call(`/hr/leaves/${r.body.id}/approve`, { method: "POST", cookie: basant });
  assert.equal(c.body.status, "CLOSED_BY_HR");
  const after = (await call("/hr/leaves/mine", { cookie: mohsen })).body.balances.find((b: { type: string }) => b.type === "سنوية");
  assert.equal(after.left, before.left - 3);
  assert.ok(await prisma.notification.findFirst({ where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email: "m.mohsen@places.com" } })).id, text: { contains: "اتسجّلت" }, createdAt: { gte: START } } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "LeaveRequest", entityId: r.body.id, action: "close" } }));
});

test("refusals: the same days twice, annual in the past, above the balance, sick without a document; the TL's rejection is final", async () => {
  assert.equal((await call("/hr/leaves", { method: "POST", cookie: mohsen, body: { type: "سنوية", from: plus(8), to: plus(8) } })).body.error, "فيه طلب إجازة تاني في نفس الأيام");
  assert.equal((await call("/hr/leaves", { method: "POST", cookie: mohsen, body: { type: "سنوية", from: plus(-3), to: plus(-2) } })).body.error, "الطلب بيتعمل قبل الإجازة");
  assert.match((await call("/hr/leaves", { method: "POST", cookie: mohsen, body: { type: "سنوية", from: plus(20), to: plus(60) } })).body.error, /الرصيد/);
  assert.equal((await call("/hr/leaves", { method: "POST", cookie: mohsen, body: { type: "مرضية", from: plus(-2), to: plus(-1) } })).body.error, "الإجازة مرضية بتتسجّل بمستند");
  const r = await call("/hr/leaves", { method: "POST", cookie: mohsen, body: { type: "سنوية", from: plus(14), to: plus(14) } });
  assert.equal((await call(`/hr/leaves/${r.body.id}/reject`, { method: "POST", cookie: tlA, body: { reason: "ضغط شغل" } })).body.status, "REJECTED");
  assert.equal((await call(`/hr/leaves/${r.body.id}/approve`, { method: "POST", cookie: basant })).status, 403); // final
});

test("the calendar, today's list and the monthly balances report with export (7.6); sales 403", async () => {
  const month = plus(7).slice(0, 7);
  const cal = (await call(`/hr/leaves/calendar?month=${month}`, { cookie: basant })).body;
  assert.ok(cal.byDay[plus(7)]?.some((x: { name: string }) => x.name.length > 0));
  const rep = (await call(`/hr/leaves/balances?month=${month}`, { cookie: basant })).body;
  const row = rep.rows.find((x: { employeeId: string }) => x.employeeId === employeeId);
  assert.ok(row.byType["سنوية"].month >= 1);
  const x = await fetch(`${API}/hr/leaves/balances/export?month=${month}`, { headers: { cookie: basant } });
  assert.equal(x.status, 200);
  assert.equal((await call("/hr/leaves", { cookie: mohsen })).status, 403);
  // the TL sees his team's requests
  assert.ok((await call("/hr/leaves", { cookie: tlA })).body.some((l: { employeeId: string }) => l.employeeId === employeeId));
});
