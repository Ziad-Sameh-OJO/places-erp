/**
 * The leads review (M-01): a stage change answers with the drawer's view, or «went to the Draft Admin» once the lead
 * left the caller (M-09 · 1.27); only the holder stops the SLA clock (Q4); «سبب الإلغاء» belongs to a Cancellation
 * only; the same mobile created twice at once is one lead (Q7); the Team Leader hands out inside his team only, one
 * lead or several (14.7).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E-LRV ${stamp}`;
let tl: string, salesA: string, ops: string;
let a: string, b: string, outsider: string;
const skipsBefore = new Map<string, number | undefined>();

before(async () => {
  const salesRole = { user: { status: "ACTIVE" as const, roles: { some: { role: { key: "sales" } } } } };
  const lead = await prisma.employee.findFirstOrThrow({
    where: { user: { status: "ACTIVE", roles: { some: { role: { key: "tl" } } } }, teamMembers: { some: salesRole } },
    select: { id: true, user: { select: { email: true } }, teamMembers: { where: salesRole, select: { id: true, user: { select: { email: true } } } } },
    orderBy: { teamMembers: { _count: "desc" } },
  });
  const [ma, mb] = lead.teamMembers;
  [a, b] = [ma!.id, mb!.id];
  outsider = (await prisma.employee.findFirstOrThrow({ where: { ...salesRole, id: { notIn: [lead.id, ...lead.teamMembers.map((m) => m.id)] }, teamLeaderId: { not: lead.id } }, select: { id: true } })).id;
  [tl, salesA, ops] = await Promise.all([lead.user!.email, ma!.user!.email, "heba.salah@places.com"].map((e) => session(e)));
  const routing = (await prisma.setting.findUnique({ where: { key: "routing" } }))?.value as { skipTurns?: Record<string, number> } | undefined;
  for (const id of [a, b]) skipsBefore.set(id, routing?.skipTurns?.[id]);
});

after(async () => {
  const ids = (await prisma.lead.findMany({ where: { name: { startsWith: NAME } }, select: { id: true } })).map((l) => l.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, ...ids.map((id) => ({ after: { path: ["leadId"], equals: id } }))] } });
  await prisma.notification.deleteMany({ where: { text: { contains: NAME } } });
  await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  await restoreSkips();
  await prisma.$disconnect();
});

/** Hand assignments use up a turn (Q2): put the counts back, other files route leads meanwhile. */
const restoreSkips = async () => {
  for (const [id, n] of skipsBefore) {
    await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY['skipTurns', ${id}], ${JSON.stringify(n ?? 0)}::jsonb) WHERE "key" = 'routing'`;
  }
};
let n = 0;
const newLead = async (data: { assignedToId: string | null; touched?: boolean; cancelReason?: string; draft?: string; stage?: "FRESH" | "CANCELLATION" }) => (await prisma.lead.create({ data: {
  code: `L-LRV${stamp}-${++n}`, name: `${NAME} ${n}`, phones: [], area: "التجمع الخامس", type: "Rent", channel: "Facebook", createdById: "e2e",
  assignedAt: new Date(), touched: false, ...data,
} })).id;
const stage = (cookie: string, id: string, body: object) => call(`/leads/${id}/stage`, { method: "PATCH", cookie, body });
const row = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });

test("a stage change answers with the drawer's view, not the raw row; a lead that left for the Draft Admin says so", async () => {
  const id = await newLead({ assignedToId: a });
  const r = await stage(salesA, id, { stage: "Interested" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(Array.isArray(r.body.activities) && "canSeeLogs" in r.body); // LeadDetail, through the field rules (M-09)
  assert.ok(!("naMarkedById" in r.body) && !("cancelReason" in r.body));

  const gone = await stage(salesA, id, { stage: "Not Interested" });
  assert.equal(gone.status, 200, JSON.stringify(gone.body));
  assert.deepEqual(gone.body, { id, stage: "Not Interested", toDraftAdmin: true });
  assert.equal((await row(id)).draft, "admin");
  // Operations (all scope) still sees it: the drawer's view
  const back = await newLead({ assignedToId: a });
  const opsR = await stage(ops, back, { stage: "Not Interested" });
  assert.equal(opsR.status, 200);
  assert.equal(opsR.body.id, back);
  assert.ok(Array.isArray(opsR.body.activities));
  assert.equal((await stage(salesA, back, { stage: "Interested" })).status, 404); // a forbidden caller: out of scope now
});

test("only the salesperson who holds the lead stops its SLA clock (Q4)", async () => {
  const id = await newLead({ assignedToId: a });
  assert.equal((await call(`/leads/${id}/comments`, { method: "POST", cookie: tl, body: { text: "كلّمه بسرعة" } })).status, 201);
  assert.equal((await call(`/leads/${id}/calls`, { method: "POST", cookie: ops })).status, 201);
  let l = await row(id);
  assert.deepEqual([l.touched, l.firstActionAt], [false, null]);
  assert.equal((await call(`/leads/${id}/comments`, { method: "POST", cookie: salesA, body: { text: "كلّمته" } })).status, 201);
  l = await row(id);
  assert.equal(l.touched, true);
  assert.ok(l.firstActionAt);
});

test("«سبب الإلغاء» is cleared when the lead moves on, and by the Draft Admin's «رجع Fresh»; the comment is a comment", async () => {
  const id = await newLead({ assignedToId: a });
  const c = await stage(salesA, id, { stage: "Cancellation", reason: "Low Budget", note: "الميزانية قليلة" });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal((await row(id)).cancelReason, "Low Budget");
  const comments = await prisma.leadActivity.findMany({ where: { leadId: id, kind: "comment" }, select: { text: true } });
  assert.deepEqual(comments.map((x) => x.text), ["الميزانية قليلة"]); // the Activity tab shows it (10)
  assert.equal((await stage(ops, id, { stage: "Interested" })).status, 200);
  assert.equal((await row(id)).cancelReason, null);
  const filtered = await call(`/leads?cancelReason=${encodeURIComponent("Low Budget")}&q=${encodeURIComponent(NAME)}`, { cookie: ops });
  assert.ok(!filtered.body.items.some((x: { id: string }) => x.id === id));

  // the Draft Admin sends a cancelled lead back as Fresh: no reason left on it
  const drafted = await newLead({ assignedToId: null, draft: "admin", stage: "CANCELLATION", cancelReason: "Low Budget" });
  const d = await prisma.leadDraft.create({ data: { leadId: drafted, kind: "admin", fromId: a, stage: "CANCELLATION" } });
  const r = await call(`/leads/drafts/${d.id}/decide`, { method: "POST", cookie: ops, body: { to: a } });
  await restoreSkips();
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const l = await row(drafted);
  assert.deepEqual([l.stage, l.cancelReason], ["FRESH", null]);
});

test("the same mobile created twice at the same moment is one lead; the other goes to Operations as a duplicate (Q7)", async () => {
  const phone = `0155${stamp.slice(-7)}`;
  const body = (k: number) => ({ name: `${NAME} dup ${k}`, phones: [phone], area: "التجمع الخامس", type: "Rent", channel: "Facebook", assignToId: a });
  const rs = await Promise.all([1, 2, 3].map((k) => call("/leads", { method: "POST", cookie: ops, body: body(k) })));
  await restoreSkips();
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409, 409], JSON.stringify(rs.map((r) => r.body)));
  assert.equal(await prisma.lead.count({ where: { phones: { has: phone } } }), 1);
  const made = rs.find((r) => r.status === 201)!.body.id as string;
  assert.equal(await prisma.leadDuplicate.count({ where: { leadId: made } }), 2);
});

test("the Team Leader can't give a new lead to a salesperson outside his team", async () => {
  const r = await call("/leads", { method: "POST", cookie: tl, body: { name: `${NAME} out`, phones: [`0156${stamp.slice(-7)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook", assignToId: outsider } });
  assert.equal(r.status, 403, JSON.stringify(r.body));
  assert.match(r.body.error, /التيم بتاعه/);
});

test("the bulk «حوّل لسيلز»: the Team Leader inside his team, as with one lead; a salesperson can't", async () => {
  const id = await newLead({ assignedToId: a, touched: true });
  assert.equal((await call("/leads/batch", { method: "POST", cookie: salesA, body: { ids: [id], to: b } })).status, 403);
  const out = await call("/leads/batch", { method: "POST", cookie: tl, body: { ids: [id], to: outsider } });
  assert.equal(out.status, 200);
  assert.equal(out.body.failed.length, 1);
  const r = await call("/leads/batch", { method: "POST", cookie: tl, body: { ids: [id], to: b } });
  await restoreSkips();
  assert.deepEqual(r.body, { done: 1, failed: [] });
  assert.equal((await row(id)).assignedToId, b);
});
