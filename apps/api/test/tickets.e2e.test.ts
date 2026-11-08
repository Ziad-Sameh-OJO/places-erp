/**
 * M-06 · tickets end-to-end: who may open / see / act (4.1), each type's route (2.2), reply → In Progress, transfer
 * keeps the history (2.3), the department closes (7.2 · 35), the SLA escalation (2.4, the worker's job) and the
 * response report (6.1). A salesperson opens; Inventory (Manar) and Marketing (Rahma) handle; Nancy gets disputes.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { ticketSlaTick } from "../../worker/src/processors/ticket-sla.ts";
import { call, session } from "./helpers.ts";

const NO_TICKETS = "m.samy@places.com"; // gets a per-person override «tickets: nothing» for the 403 test
let admin: string, sales: string, manar: string, rahma: string, noTickets: string, noTicketsId: string;
const tickets: string[] = [];

before(async () => {
  [admin, sales, manar, rahma] = await Promise.all(["ahmed.islam@places.com", "anas@places.com", "manar.ahmed@places.com", "rahma.hassan@places.com"].map((e) => session(e)));
  noTicketsId = (await prisma.user.findUniqueOrThrow({ where: { email: NO_TICKETS } })).id;
  await prisma.permissionOverride.upsert({ where: { userId_module: { userId: noTicketsId, module: "tickets" } }, create: { userId: noTicketsId, module: "tickets", actions: [] }, update: { actions: [] } });
  noTickets = await session(NO_TICKETS);
});

after(async () => {
  await prisma.permissionOverride.deleteMany({ where: { userId: noTicketsId, module: "tickets" } });
  await prisma.notification.deleteMany({ where: { OR: tickets.map((id) => ({ link: { contains: id } })) } });
  await prisma.ticket.deleteMany({ where: { id: { in: tickets } } });
  await prisma.$disconnect();
});

async function open(cookie: string, body: Record<string, unknown>) {
  const r = await call("/tickets", { method: "POST", cookie, body: { priority: "normal", ...body } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tickets.push(r.body.id);
  return r.body as { id: string; code: string };
}

test("without «tickets» permission: 403 everywhere; the response report needs «reports: view»", async () => {
  assert.equal((await call("/tickets", { cookie: noTickets })).status, 403);
  assert.equal((await call("/tickets", { method: "POST", cookie: noTickets, body: { type: "request", department: "HR", title: "ممنوع" } })).status, 403);
  assert.equal((await call("/tickets/report", { cookie: sales })).status, 403);
  assert.equal((await call("/tickets/report", { cookie: manar })).status, 200);
});

test("each type goes to its own department (M-06 2.2); a plain request goes where it was sent, from «أقسام التذاكر»", async () => {
  const dept = async (id: string) => (await prisma.ticket.findUniqueOrThrow({ where: { id } })).department;
  assert.equal(await dept((await open(sales, { type: "hr_letter", department: "Inventory", title: "E2E HR Letter للسفارة" })).id), "HR");
  assert.equal(await dept((await open(sales, { type: "dispute", title: "E2E نزاع على عميل" })).id), "الإدارة");
  // the List request is opened from the leads page, so it carries its units (2.32 · list-requests.e2e)
  assert.equal((await call("/tickets", { method: "POST", cookie: sales, body: { type: "list", title: "E2E List وحدات التجمع" } })).status, 400);
  assert.equal(await dept((await open(sales, { type: "purchase", title: "E2E صيانة تكييف" })).id), "Accounts");
  const noDept = await call("/tickets", { method: "POST", cookie: sales, body: { type: "request", title: "E2E من غير قسم" } });
  assert.equal(noDept.status, 400);
  assert.match(JSON.stringify(noDept.body), /اختار القسم/);
  assert.equal((await call("/tickets", { method: "POST", cookie: sales, body: { type: "request", department: "المريخ", title: "E2E قسم مش موجود" } })).status, 400);
  assert.equal((await call("/tickets", { method: "POST", cookie: sales, body: { type: "excuse", title: "E2E" } })).status, 400);
});

test("the flow: open → the department answers (In Progress) → transferred, history kept → resolved → the department closes", async () => {
  const t = await open(sales, { type: "request", department: "Inventory", priority: "high", title: "E2E بيانات وحدة 304" });
  assert.match(t.code, /^TK-\d+$/);
  const audit = (action: string) => prisma.auditLog.count({ where: { entity: "Ticket", entityId: t.id, action } });
  assert.equal(await audit("create"), 1);
  // Inventory sees it and was told; Marketing doesn't see another department's ticket
  assert.ok((await call("/tickets?view=assigned&pageSize=100", { cookie: manar })).body.items.some((x: { id: string }) => x.id === t.id));
  assert.equal((await call(`/tickets/${t.id}`, { cookie: rahma })).status, 404);
  assert.ok(await prisma.notification.count({ where: { link: { contains: t.id }, userId: (await prisma.user.findUniqueOrThrow({ where: { email: "manar.ahmed@places.com" } })).id } }));
  // the one who opened it writes, the status stays; only the department moves it
  assert.equal((await call(`/tickets/${t.id}/replies`, { method: "POST", cookie: sales, body: { text: "محتاجها النهارده" } })).body.status, "Open");
  assert.equal((await call(`/tickets/${t.id}/replies`, { method: "POST", cookie: sales, body: { text: "x", status: "Resolved" } })).status, 403);
  const replied = await call(`/tickets/${t.id}/replies`, { method: "POST", cookie: manar, body: { text: "بنجهزها" } });
  assert.equal(replied.status, 200, JSON.stringify(replied.body));
  assert.equal(replied.body.status, "In Progress");
  assert.ok(replied.body.firstReplyAt);
  // wrong department → transfer: still open, history kept, now Marketing's
  assert.equal((await call(`/tickets/${t.id}/transfer`, { method: "POST", cookie: sales, body: { department: "Marketing" } })).status, 403);
  assert.equal((await call(`/tickets/${t.id}/transfer`, { method: "POST", cookie: manar, body: { department: "Marketing" } })).status, 200);
  assert.equal((await call(`/tickets/${t.id}`, { cookie: manar })).status, 404);
  const moved = (await call(`/tickets/${t.id}`, { cookie: rahma })).body;
  assert.equal(moved.department, "Marketing");
  assert.equal(moved.status, "In Progress");
  assert.deepEqual(moved.events.map((e: { kind: string }) => e.kind), ["open", "reply", "reply", "status", "transfer"]);
  // close only after Resolved, and only by the department
  assert.equal((await call(`/tickets/${t.id}/close`, { method: "POST", cookie: rahma })).status, 400);
  assert.equal((await call(`/tickets/${t.id}/replies`, { method: "POST", cookie: rahma, body: { text: "اتبعتت", status: "Resolved" } })).body.status, "Resolved");
  assert.equal((await call(`/tickets/${t.id}/close`, { method: "POST", cookie: sales })).status, 403);
  const closed = await call(`/tickets/${t.id}/close`, { method: "POST", cookie: rahma });
  assert.equal(closed.body.status, "Closed");
  assert.equal((await call(`/tickets/${t.id}/replies`, { method: "POST", cookie: rahma, body: { text: "تاني" } })).status, 400);
  for (const a of ["reply", "transfer", "close"]) assert.ok((await audit(a)) >= 1, a);
  // the requester still sees it under «اتقفلت»; the admin sees everything
  assert.ok((await call("/tickets?view=closed&pageSize=100", { cookie: sales })).body.items.some((x: { id: string }) => x.id === t.id));
  assert.equal((await call(`/tickets/${t.id}`, { cookie: admin })).status, 200);
});

test("SLA (M-06 2.4 · 7.1): no reply in 24 working hours → escalated to Inventory's manager once; a dispute past 48h → Nancy", async () => {
  const req = await open(sales, { type: "request", department: "Inventory", title: "E2E محدش رد" });
  const dispute = await open(sales, { type: "dispute", title: "E2E نزاع اتأخر" });
  const fresh = await open(sales, { type: "request", department: "Inventory", title: "E2E لسه جديدة" });
  const now = new Date();
  await prisma.ticket.update({ where: { id: req.id }, data: { createdAt: new Date(now.getTime() - 10 * 86_400_000) } }); // 10 days: > 24 working hours whatever the day
  await prisma.ticket.update({ where: { id: dispute.id }, data: { createdAt: new Date(now.getTime() - 49 * 3_600_000) } });
  assert.ok((await call("/tickets?view=late&pageSize=100", { cookie: manar })).body.items.some((x: { id: string }) => x.id === req.id));

  await ticketSlaTick(now);
  const [r, d, f] = await Promise.all([req, dispute, fresh].map((x) => prisma.ticket.findUniqueOrThrow({ where: { id: x.id }, include: { events: true } })));
  assert.ok(r!.escalatedAt && d!.escalatedAt);
  assert.equal(f!.escalatedAt, null);
  assert.ok(r!.events.some((e) => e.kind === "escalate" && e.byUserId === null));
  const told = async (id: string, email: string) =>
    prisma.notification.count({ where: { link: { contains: id }, important: true, userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id } });
  assert.equal(await told(req.id, "manar.ahmed@places.com"), 1); // Inventory's Department Head
  assert.equal(await told(req.id, "marwa.mostafa@places.com"), 0); // staff only got the new-ticket notice, not the escalation
  assert.equal(await told(dispute.id, "nancy.islam@places.com"), 1);
  assert.equal(await prisma.auditLog.count({ where: { entityId: req.id, action: "escalate" } }), 1);

  await ticketSlaTick(now); // idempotent: the worker may run twice
  assert.equal(await told(req.id, "manar.ahmed@places.com"), 1);
  assert.equal(await prisma.ticketEvent.count({ where: { ticketId: req.id, kind: "escalate" } }), 1);
});

test("response report (M-06 6.1): per department, closed in the SLA ÷ all tickets; a bad month is refused", async () => {
  const r = await call("/tickets/report", { cookie: admin });
  assert.equal(r.status, 200);
  assert.match(r.body.month, /^\d{4}-\d{2}$/);
  const inv = r.body.rows.find((x: { department: string }) => x.department === "Inventory");
  assert.ok(inv.total >= 1);
  assert.ok(inv.percent === null || (inv.percent >= 0 && inv.percent <= 100));
  assert.ok(r.body.rows.some((x: { department: string }) => x.department === "HR"));
  assert.equal((await call("/tickets/report?month=2026-13", { cookie: admin })).status, 400);
  const s = await call("/tickets/summary", { cookie: manar });
  assert.equal(s.status, 200);
  assert.equal(s.body.department, "Inventory");
});
