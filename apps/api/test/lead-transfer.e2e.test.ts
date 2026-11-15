/**
 * 14.7 · M-01 (management meeting, 15 Nov): moving a lead by hand. The one it was taken from gets a 404 and isn't told
 * where it went; «الجديد يشوف الكومنتات القديمة؟» (default no) hides the earlier comments from the new holder and his
 * Team Leader while the Super Admin sees them all; a Team Leader moves leads only inside his own team.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import type { LeadDetail, LeadOptions } from "@places/contracts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E-LTR ${stamp}`;
let tl: string, salesA: string, salesB: string, ops: string, admin: string;
let a: string, b: string, outsider: string, aUser: string, leadId: string;

before(async () => {
  const salesRole = { user: { status: "ACTIVE" as const, roles: { some: { role: { key: "sales" } } } } };
  // a Team Leader with two salespeople in his team, and a salesperson outside it
  const lead = await prisma.employee.findFirstOrThrow({
    where: { user: { status: "ACTIVE", roles: { some: { role: { key: "tl" } } } }, teamMembers: { some: salesRole } },
    select: { id: true, user: { select: { email: true } }, teamMembers: { where: salesRole, select: { id: true, userId: true, user: { select: { email: true } } } } },
    orderBy: { teamMembers: { _count: "desc" } },
  });
  assert.ok(lead.teamMembers.length >= 2, "the seed has a Team Leader with two salespeople");
  const [ma, mb] = lead.teamMembers;
  [a, b, aUser] = [ma!.id, mb!.id, ma!.userId!];
  outsider = (await prisma.employee.findFirstOrThrow({ where: { ...salesRole, id: { notIn: [lead.id, ...lead.teamMembers.map((m) => m.id)] }, teamLeaderId: { not: lead.id } }, select: { id: true } })).id;
  [tl, salesA, salesB, ops, admin] = await Promise.all(
    [lead.user!.email, ma!.user!.email, mb!.user!.email, "heba.salah@places.com", "ahmed.islam@places.com"].map((e) => session(e)),
  );
  leadId = (await prisma.lead.create({ data: { code: `L-E2ELTR${stamp}`, name: NAME, phones: [], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    createdById: "e2e", assignedToId: a, assignedAt: new Date(), touched: true } })).id;
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: leadId }, { after: { path: ["leadId"], equals: leadId } }] } });
  await prisma.notification.deleteMany({ where: { text: { contains: NAME } } });
  await prisma.lead.deleteMany({ where: { id: leadId } });
  await prisma.$disconnect();
});

/** A hand transfer uses up the new holder's next rotation turn (1.14): put it back at once, other files route leads meanwhile. */
const move = async (cookie: string, to: string, showOldComments?: boolean) => {
  const r = await call(`/leads/${leadId}/assign`, { method: "POST", cookie, body: { to, showOldComments } });
  if (r.status === 200) {
    await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY['skipTurns', ${to}], to_jsonb(greatest(coalesce(("value"->'skipTurns'->>${to})::int, 0) - 1, 0))) WHERE "key" = 'routing'`;
  }
  return r;
};
const comments = async (cookie: string) => ((await call(`/leads/${leadId}`, { cookie })).body as LeadDetail).activities.filter((x) => x.kind === "comment").map((x) => x.text);

test("a salesperson can't move a lead; a Team Leader can't move it outside his team", async () => {
  assert.equal((await move(salesA, b)).status, 403);
  const out = await move(tl, outsider);
  assert.equal(out.status, 403);
  assert.match(out.body.error, /التيم بتاعه/);
  // his picker lists only his team
  const options = (await call("/leads/options", { cookie: tl })).body as LeadOptions;
  assert.ok(options.assignable.some((p) => p.id === b));
  assert.ok(!options.assignable.some((p) => p.id === outsider));
  assert.equal(((await call(`/leads/${leadId}`, { cookie: tl })).body as LeadDetail).canTransfer, true);
  assert.equal(((await call(`/leads/${leadId}`, { cookie: salesA })).body as LeadDetail).canTransfer, false);
});

test("the TL moves it inside his team (default: old comments hidden): the old holder gets a 404 and isn't told", async () => {
  assert.equal((await call(`/leads/${leadId}/comments`, { method: "POST", cookie: salesA, body: { text: "العميل عايز خصم" } })).status, 201);
  const since = new Date(Date.now() - 2_000);
  const r = await move(tl, b);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await call(`/leads/${leadId}`, { cookie: salesA })).status, 404);
  assert.equal((await call(`/leads/${leadId}/comments`, { method: "POST", cookie: salesA, body: { text: "x" } })).status, 404);
  assert.equal(await prisma.notification.count({ where: { userId: aUser, createdAt: { gte: since }, OR: [{ text: { contains: NAME } }, { link: { contains: leadId } }] } }), 0);
  // the new holder and his TL don't see the old comment; the Super Admin does, in the Activity and the Logs
  assert.deepEqual(await comments(salesB), []);
  assert.deepEqual(await comments(tl), []);
  assert.deepEqual(await comments(admin), ["العميل عايز خصم"]);
  const logs = (await call(`/leads/${leadId}/logs`, { cookie: admin })).body as { text: string }[];
  assert.ok(logs.some((x) => x.text === "العميل عايز خصم"));
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: leadId, action: "reassign" } });
  assert.equal((audit.before as { assignedToId: string }).assignedToId, a);
  assert.ok((audit.after as { commentsFrom: string | null }).commentsFrom);
});

test("«يشوف الكومنتات القديمة»: the next holder sees what the last one saw, never the comments hidden before", async () => {
  assert.equal((await call(`/leads/${leadId}/comments`, { method: "POST", cookie: salesB, body: { text: "اتفقنا على معاينة" } })).status, 201);
  const r = await move(ops, a, true);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await call(`/leads/${leadId}`, { cookie: salesB })).status, 404);
  assert.deepEqual(await comments(salesA), ["اتفقنا على معاينة"]);
  assert.deepEqual(await comments(admin), ["اتفقنا على معاينة", "العميل عايز خصم"]);
});
