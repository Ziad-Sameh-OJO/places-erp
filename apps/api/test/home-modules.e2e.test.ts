/**
 * 0.18 · «مهامي النهارده» gathers every module (demo home.js): each `/home/<module>` answers only for whom has the
 * module, in their scope, with only what is their turn. A leave from a salesperson of Abdallah Sleem's team is the TL's
 * line, then — once he approves — HR's (Basant) and no longer his; a ticket to HR is on Basant's board, not on the
 * board of the salesperson who opened it; a salesperson gets 403 on HR's and procurement's lines.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, cleanLeaveNotices, session } from "./helpers.ts";

const START = new Date();
const stamp = String(START.getTime());
let mohsen: string, tl: string, hr: string, mate: string, mateId: string;
const tickets: string[] = [];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const plus = (n: number) => { const d = new Date(`${today()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

before(async () => {
  [mohsen, tl, hr] = await Promise.all(["m.mohsen@places.com", "abdallah.sleem@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const tlId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "abdallah.sleem@places.com" } } })).id;
  // a teammate of Mohsen's (the leaves test asks with Mohsen himself), the first by name
  const e = await prisma.employee.findFirstOrThrow({ where: { teamLeaderId: tlId, user: { email: { not: "m.mohsen@places.com" }, status: "ACTIVE" } }, orderBy: { name: "asc" }, select: { id: true, user: { select: { email: true } } } });
  mateId = e.id;
  mate = await session(e.user!.email);
});
after(async () => {
  const ids = (await prisma.leaveRequest.findMany({ where: { employeeId: mateId, createdAt: { gte: START } }, select: { id: true } })).map((r) => r.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...tickets] } } });
  await prisma.leaveRequest.deleteMany({ where: { id: { in: ids } } });
  await cleanLeaveNotices(mateId, START);
  await prisma.notification.deleteMany({ where: { OR: tickets.map((id) => ({ link: { contains: id } })) } });
  await prisma.ticket.deleteMany({ where: { id: { in: tickets } } });
  await prisma.$disconnect();
});

interface Line { kind: string; tone: string; id: string; values: Record<string, string | number> }
const lines = async (path: string, cookie: string) => {
  const r = await call(`/home/${path}`, { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as Line[];
};
const has = (all: Line[], kind: string, id: string) => all.some((x) => x.kind === kind && x.id === id);

test("a leave is the TL's line first, then HR's once he approves — never both at once (demo home.js)", async () => {
  const ask = await call("/hr/leaves", { method: "POST", cookie: mate, body: { type: "شغل من بره", from: plus(75), to: plus(75), reason: `E2E-HM ${stamp}` } });
  assert.equal(ask.status, 201, JSON.stringify(ask.body));
  const id = ask.body.id as string;
  const tlLine = (await lines("hr", tl)).find((x) => x.id === id);
  assert.equal(tlLine?.kind, "leaveTl");
  assert.equal(tlLine?.values.from, plus(75));
  assert.equal(has(await lines("hr", hr), "leaveHr", id), false); // HR waits for the TL
  assert.equal((await call(`/hr/leaves/${id}/approve`, { method: "POST", cookie: tl })).status, 201);
  assert.equal(has(await lines("hr", hr), "leaveHr", id), true);
  assert.equal((await lines("hr", tl)).some((x) => x.id === id), false);
});

test("a ticket to HR is on HR's board, not on the board of whom opened it; tickets in their department only", async () => {
  const r = await call("/tickets", { method: "POST", cookie: mohsen, body: { type: "hr_letter", priority: "normal", title: `E2E-HM ${stamp} HR Letter` } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tickets.push(r.body.id);
  const mine = (await lines("tickets", hr)).find((x) => x.id === r.body.id);
  assert.equal(mine?.kind, "ticket");
  assert.equal(mine?.tone, ""); // just opened: inside its SLA
  assert.equal(mine?.values.code, r.body.code);
  assert.equal(has(await lines("tickets", mohsen), "ticket", r.body.id), false);
});

test("forbidden: a salesperson has no HR or procurement lines (403); a module's endpoint answers only with its grant", async () => {
  assert.equal((await call("/home/hr", { cookie: mohsen })).status, 403);
  assert.equal((await call("/home/procurement", { cookie: mohsen })).status, 403);
  assert.equal((await call("/home/marketing", { cookie: hr })).status, 403);
  assert.equal((await call("/home/tasks", { cookie: mohsen })).status, 403);
  assert.equal((await call("/home/deals")).status, 401); // signed in only
  // signed in without the grants the deals' lines lead to: nothing to review, approve or sign
  assert.deepEqual(await lines("deals", hr), []);
});
