/**
 * M-04 · the Broadcast end-to-end (4.8): Rahma sends a message with its Hot Inventory as a task to sales (2.1 steps
 * 7-8); each salesperson presses Done once, noting other units they broadcast (2.3 · 24), and Rahma sees who did;
 * a Broadcast from someone who can't approve waits (2.2); the week's count (M-12); who may do what (4.1).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const START = new Date(Date.now() - 2_000);
const stamp = Date.now().toString(36);
const WRITER = "ziad.medhat@places.com"; // given «marketing: view + create» here: his Broadcast waits for the manager
let rahma: string, anas: string, bayoumi: string, writer: string, anasId: string, writerId: string, hot: string, draft: string;
const broadcasts: string[] = [];

before(async () => {
  writerId = (await prisma.user.findUniqueOrThrow({ where: { email: WRITER } })).id;
  anasId = (await prisma.user.findUniqueOrThrow({ where: { email: "anas@places.com" } })).id;
  await prisma.permissionOverride.upsert({ where: { userId_module: { userId: writerId, module: "marketing" } }, create: { userId: writerId, module: "marketing", actions: ["view", "create"] }, update: { actions: ["view", "create"] } });
  [rahma, anas, bayoumi, writer] = await Promise.all(["rahma.hassan@places.com", "anas@places.com", "abdelrahman.bayoumi@places.com", WRITER].map((e) => session(e)));
  const unit = (n: number, pdfStatus: string) => prisma.unit.create({ data: { code: `U-B${stamp}${n}`, type: "Rent", project: `مشروع ${stamp}`, area: "التجمع الخامس", space: 400 + n, condition: "Finished", pdfStatus } });
  hot = (await unit(1, "confirmed")).id;
  draft = (await unit(2, "draft")).id;
});

after(async () => {
  // «رسالة Broadcast جديدة» names nothing: the ones sent since this file started (no other file sends Broadcasts)
  await prisma.notification.deleteMany({ where: { event: "marketing.broadcast", createdAt: { gte: START } } });
  await prisma.permissionOverride.deleteMany({ where: { userId: writerId, module: "marketing" } });
  await prisma.broadcast.deleteMany({ where: { id: { in: broadcasts } } });
  await prisma.unit.deleteMany({ where: { code: { startsWith: `U-B${stamp}` } } });
  await prisma.$disconnect();
});

async function send(cookie: string, extra: Record<string, unknown> = {}) {
  const r = await call("/marketing/broadcasts", { method: "POST", cookie, body: { text: `E2E Broadcast ${stamp}`, hotUnitIds: [hot], ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  broadcasts.push(r.body.id);
  return r.body.id as string;
}

test("who may: sales can't see the board or send (403); a draft unit can't be Hot Inventory", async () => {
  assert.equal((await call("/marketing/broadcasts", { cookie: anas })).status, 403);
  assert.equal((await call("/marketing/broadcasts", { method: "POST", cookie: anas, body: { text: "ممنوع" } })).status, 403);
  assert.equal((await call("/marketing/broadcasts", { method: "POST", cookie: rahma, body: { text: `E2E ${stamp}`, hotUnitIds: [draft] } })).status, 400);
  assert.ok((await call(`/marketing/broadcasts/hot-units?q=U-B${stamp}`, { cookie: rahma })).body.some((u: { id: string }) => u.id === hot));
});

test("the flow: Rahma sends → sales hear and see the task → Done once, with other units → Rahma sees it; the week counts it", async () => {
  const id = await send(rahma);
  const before = (await call("/marketing/broadcasts", { cookie: rahma })).body.whatsapp as { sent: number; limit: number };
  assert.ok(await prisma.notification.count({ where: { userId: anasId, text: { contains: "Broadcast" }, createdAt: { gte: new Date(Date.now() - 60_000) } } }));
  const mine = (await call("/marketing/broadcasts/mine", { cookie: anas })).body as Array<{ id: string; doneAt: string | null; hotUnits: { code: string }[] }>;
  const task = mine.find((b) => b.id === id)!;
  assert.equal(task.doneAt, null);
  assert.deepEqual(task.hotUnits.map((u) => u.code), [`U-B${stamp}1`]);
  assert.deepEqual((await call("/marketing/broadcasts/mine", { cookie: bayoumi })).body, []); // not a salesperson
  assert.equal((await call(`/marketing/broadcasts/${id}/done`, { method: "POST", cookie: bayoumi, body: {} })).status, 403);

  assert.equal((await call(`/marketing/broadcasts/${id}/done`, { method: "POST", cookie: anas, body: { otherUnits: ["u-101", "U-205"] } })).status, 204);
  assert.equal((await call(`/marketing/broadcasts/${id}/done`, { method: "POST", cookie: anas, body: {} })).status, 400);
  assert.ok((await call("/marketing/broadcasts/mine", { cookie: anas })).body.find((b: { id: string }) => b.id === id).doneAt);

  const board = (await call("/marketing/broadcasts", { cookie: rahma })).body;
  const row = board.items.find((b: { id: string }) => b.id === id);
  assert.deepEqual(row.sent.map((s: { id: string; otherUnits: string[] }) => [s.id, s.otherUnits]), [[anasId, ["U-101", "U-205"]]]);
  assert.ok(row.pending >= 1);
  assert.ok(board.week.sent >= 1 && board.week.of === 2);
  // 4.8 · M-04 2.3 «حد الواتساب اليومي»: the Done adds 25 messages to the company's count today, of the setting (250); it warns only
  assert.ok(board.whatsapp.sent >= before.sent + 25 && board.whatsapp.sent % 25 === 0, JSON.stringify(board.whatsapp));
  assert.equal(typeof board.whatsapp.limit, "number"); // the setting (250 in the seed; other tests may change it)
  assert.ok(["ok", "warn", "bad"].includes(board.whatsapp.tone));
  assert.equal(await prisma.auditLog.count({ where: { entity: "Broadcast", entityId: id } }), 1);
});

test("M-04 2.2: a Broadcast from someone who can't approve waits — sales don't see it until the manager approves", async () => {
  const id = await send(writer);
  assert.ok(!(await call("/marketing/broadcasts/mine", { cookie: anas })).body.some((b: { id: string }) => b.id === id));
  assert.equal((await call(`/marketing/broadcasts/${id}/done`, { method: "POST", cookie: anas, body: {} })).status, 404);
  assert.equal((await call(`/marketing/broadcasts/${id}/approve`, { method: "POST", cookie: writer })).status, 403);
  assert.equal((await call(`/marketing/broadcasts/${id}/approve`, { method: "POST", cookie: rahma })).status, 204);
  assert.ok((await call("/marketing/broadcasts/mine", { cookie: anas })).body.some((b: { id: string }) => b.id === id));
});

test("two approve clicks at once: one approves (204), the other gets 409, and sales hear «Broadcast جديد» once", async () => {
  const id = await send(writer);
  const t0 = new Date();
  const codes = (await Promise.all([1, 2].map(() => call(`/marketing/broadcasts/${id}/approve`, { method: "POST", cookie: rahma })))).map((r) => r.status).sort();
  assert.deepEqual(codes, [204, 409]);
  assert.equal(await prisma.notification.count({ where: { userId: anasId, event: "marketing.broadcast", createdAt: { gte: t0 } } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Broadcast", entityId: id, action: "approve" } }), 1);
  assert.equal((await call(`/marketing/broadcasts/${id}/approve`, { method: "POST", cookie: rahma })).status, 409);
});
