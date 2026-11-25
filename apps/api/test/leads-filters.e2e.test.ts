/**
 * 14.4 · 14.5 · 14.6 (management meeting, 15 Nov) against the real API and database: the lead's type (Commercial /
 * Residential / Admin office) is saved and filtered; several salespeople, the Team Leader's team, the channel, the
 * area (any part of it) and the stage filter together; the search finds the company and its number; the stage tabs'
 * counts; «مين دخّل الليد» in the drawer; the removed «Follow up …» stages are refused. The client's list (22 Nov):
 * Type, the company, Space, Budget, Duplicated, Created by, Assign from, Assign date, Action date / Last action, the
 * cancel reason.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import type { LeadDetail, LeadOptions, LeadRow, LeadSummary } from "@places/contracts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E-LF ${stamp}`;
const phone = (n: number) => `0122${stamp.slice(-6)}${n}`;
let ops: string, mohsen: string, hr: string;
let mohsenId: string, eidId: string, amrId: string, tlD: string, companyId: string;
const ids: Record<string, string> = {};

before(async () => {
  [ops, mohsen, hr] = await Promise.all(["heba.salah@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const emp = (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } }, select: { id: true, teamLeaderId: true } });
  const [m, e, a] = await Promise.all([emp("m.mohsen@places.com"), emp("m.eid@places.com"), emp("ahmed.amr@places.com")]);
  [mohsenId, eidId, amrId, tlD] = [m.id, e.id, a.id, m.teamLeaderId!];
  companyId = (await prisma.company.create({ data: { name: `${NAME} Co`, category: "IT", number: `N${stamp}` } })).id;
  const lead = async (key: string, n: number, assignedToId: string, extra: object) => {
    ids[key] = (await prisma.lead.create({ data: { code: `L-LF${stamp}${n}`, name: `${NAME} ${key}`, phones: [phone(n)], area: "التجمع الخامس", type: "Rent",
      channel: "Facebook", assignedToId, assignedAt: new Date(), createdById: "e2e", ...extra } })).id;
  };
  await lead("a", 1, mohsenId, { stage: "MEETING", propertyType: "Commercial", companyId });
  await lead("b", 2, amrId, { stage: "MEETING", propertyType: "Residential" });
  await lead("c", 3, mohsenId, { stage: "FRESH", channel: "Instagram", area: "الشيخ زايد" });
  await lead("d", 4, eidId, { stage: "MEETING", propertyType: "Admin office" });
});
after(async () => {
  const all = await prisma.lead.findMany({ where: { name: { startsWith: NAME } }, select: { id: true } });
  const leadIds = all.map((l) => l.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: leadIds } } });
  await prisma.notification.deleteMany({ where: { text: { contains: NAME } } });
  await prisma.leadActivity.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.leadDraft.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.leadVisit.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.leadArrival.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

const list = async (cookie: string, q: string) => {
  const r = await call(`/leads?pageSize=100&q=${encodeURIComponent(NAME)}${q}`, { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (r.body.items as LeadRow[]).map((l) => l.name.slice(NAME.length + 1)).sort();
};

test("14.6: every filter together — Meeting + two salespeople, the team, the type, the channel, the area typed", async () => {
  assert.deepEqual(await list(ops, ""), ["a", "b", "c", "d"]);
  assert.deepEqual(await list(ops, `&stage=Meeting&assignedToId=${mohsenId},${amrId}`), ["a", "b"]);
  assert.deepEqual(await list(ops, `&assignedToId=${mohsenId}`), ["a", "c"]); // one salesperson still works
  assert.deepEqual(await list(ops, `&teamLeaderId=${tlD}`), ["a", "c", "d"]); // the TL's people (Team D), not Team C's
  assert.deepEqual(await list(ops, `&teamLeaderId=${tlD}&stage=Meeting&propertyType=Admin%20office`), ["d"]);
  assert.deepEqual(await list(ops, "&propertyType=Commercial"), ["a"]);
  assert.deepEqual(await list(ops, "&channel=Instagram"), ["c"]);
  assert.deepEqual(await list(ops, `&area=${encodeURIComponent("زايد")}`), ["c"]); // any part of the area's name
  // the board and the tabs read the same filters
  const board = (await call(`/leads/board?q=${encodeURIComponent(NAME)}&assignedToId=${mohsenId},${amrId}`, { cookie: ops })).body;
  assert.equal(board.lanes.find((l: { stage: string }) => l.stage === "Meeting").total, 2);
  assert.equal((await call(`/leads/tabs?q=${encodeURIComponent(NAME)}&teamLeaderId=${tlD}`, { cookie: ops })).body.client, 3);
  // refused: a type that doesn't exist, a removed stage, a bad id list
  for (const q of ["&propertyType=Villa", `&stage=${encodeURIComponent("Follow up to Visit")}`, "&stage=Qualified", `&assignedToId=${"x".repeat(41)}`]) {
    assert.equal((await call(`/leads?q=x${q}`, { cookie: ops })).status, 400, q);
  }
});

test("14.6: the search finds the name, the company, the company's number and the lead's code", async () => {
  const find = async (q: string) => ((await call(`/leads?pageSize=100&q=${encodeURIComponent(q)}`, { cookie: ops })).body.items as LeadRow[]).map((l) => l.id);
  assert.deepEqual(await find(`${NAME} Co`), [ids.a]);
  assert.deepEqual(await find(`N${stamp}`), [ids.a]);
  assert.deepEqual(await find(`l-lf${stamp}3`), [ids.c]);
  assert.ok((await find(phone(4))).includes(ids.d!));
});

test("14.6: scope stays — a salesperson filtering by another team sees only their own leads; HR may not list leads", async () => {
  assert.deepEqual(await list(mohsen, ""), ["a", "c"]);
  assert.deepEqual(await list(mohsen, `&assignedToId=${amrId}`), []);
  assert.deepEqual(await list(mohsen, `&teamLeaderId=${tlD}`), ["a", "c"]);
  assert.equal((await call(`/leads?propertyType=Commercial`, { cookie: hr })).status, 403);
  assert.equal((await call("/leads/options", { cookie: hr })).status, 403);
  // «التيم»: Operations picks from the Team Leaders; a salesperson has nobody to pick
  const opts = (await call("/leads/options", { cookie: ops })).body as LeadOptions;
  assert.ok(opts.teamLeaders.some((t) => t.id === tlD));
  assert.ok(!opts.teamLeaders.some((t) => t.id === mohsenId));
  assert.deepEqual(((await call("/leads/options", { cookie: mohsen })).body as LeadOptions).teamLeaders, []);
});

test("14.6: the type is saved on a new lead and changed by «تعديل البيانات», audited; 14.4: «مين دخّل الليد»", async () => {
  const body = { name: `${NAME} new`, phones: [phone(5)], area: "التجمع الخامس", type: "Rent", channel: "Facebook", propertyType: "Commercial" };
  assert.equal((await call("/leads", { method: "POST", cookie: mohsen, body: { ...body, propertyType: "Villa" } })).status, 400);
  const r = await call("/leads", { method: "POST", cookie: mohsen, body }); // a salesperson's own lead: no rotation turn used
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const d = (await call(`/leads/${r.body.id}`, { cookie: ops })).body as LeadDetail;
  assert.equal(d.propertyType, "Commercial");
  assert.equal(d.createdBy?.name, "Mohamed Mohsen");
  assert.deepEqual(await list(ops, "&propertyType=Commercial"), ["a", "new"]);

  const e = await call(`/leads/${r.body.id}`, { method: "PUT", cookie: ops, body: { name: `${NAME} new`, propertyType: "Residential" } });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.equal(e.body.propertyType, "Residential");
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: r.body.id, action: "update" }, select: { before: true, after: true } });
  assert.deepEqual(audit.before, { propertyType: "Commercial" });
  assert.deepEqual(audit.after, { propertyType: "Residential" });
  // optional: older leads have none, and the row says so
  assert.equal(((await call(`/leads/${ids.c}`, { cookie: ops })).body as LeadDetail).propertyType, null);
  assert.equal(((await call(`/leads/${ids.c}`, { cookie: ops })).body as LeadDetail).createdBy, null); // imported: nobody
});

test("14.5: the stage tabs' counts by stage, no «Qualified» or «Follow up …» stage left", async () => {
  const s = (await call("/leads/summary", { cookie: ops })).body as LeadSummary;
  assert.ok((s.stages.Meeting ?? 0) >= 3);
  assert.ok(Object.keys(s.stages).every((k) => !k.startsWith("Follow up") && k !== "Qualified"));
  const stages = (await call("/settings/stages", { cookie: ops })).body as { stage: string }[];
  assert.deepEqual(stages.map((x) => x.stage), ["Fresh", "No Answer", "Interested", "Not Interested", "Visit", "Meeting", "Near to Close", "Done Deal", "Cancellation", "Hold"]);
  assert.equal(await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "sales"."LeadDraft" WHERE "stage" LIKE 'FOLLOW_UP%'`.then((r) => Number(r[0]!.n)), 0);
});

test("the client's filters (22 Nov): type, company, space, budget, duplicated, created by, assign from / date, action, cancel reason", async () => {
  const K = `${NAME} K`, opsUser = await prisma.user.findUniqueOrThrow({ where: { email: "heba.salah@places.com" }, select: { id: true } });
  const make = async (n: number, extra: object) => (await prisma.lead.create({ data: { code: `L-LK${stamp}${n}`, name: `${K}${n}`, phones: [phone(6 + n)], area: "التجمع الخامس",
    channel: "Facebook", stage: "INTERESTED", createdById: "e2e", ...extra } })).id;
  const k1 = await make(1, { type: "Resale", space: 120, budget: "500000", companyId, createdById: opsUser.id, assignedToId: mohsenId, assignedAt: new Date() });
  const k2 = await make(2, { type: "Rent", space: 300, budget: "2000000", assignedToId: mohsenId, assignedAt: new Date() });
  const k3 = await make(3, { type: "Income", space: 80, assignedToId: amrId, assignedAt: new Date("2025-01-10T10:00:00Z") });
  const k = async (q: string) => {
    const r = await call(`/leads?pageSize=100&q=${encodeURIComponent(K)}${q}`, { cookie: ops });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return (r.body.items as LeadRow[]).map((l) => l.name.slice(K.length)).sort();
  };
  assert.deepEqual(await k(""), ["1", "2", "3"]);
  assert.deepEqual(await k("&type=Resale"), ["1"]);
  assert.deepEqual(await k(`&company=${encodeURIComponent(" co")}`), ["1"]); // any part of the company's name, any case
  assert.deepEqual(await k("&spaceMin=100&spaceMax=200"), ["1"]);
  assert.deepEqual(await k("&spaceMax=120"), ["1", "3"]); // both ends included
  assert.deepEqual(await k("&budgetMin=1000000"), ["2"]);
  assert.deepEqual(await k(`&createdById=${opsUser.id}`), ["1"]);
  assert.deepEqual(await k("&assignedFrom=2025-01-01&assignedTo=2025-01-31"), ["3"]);

  // Duplicated: its number came in again
  await prisma.leadArrival.create({ data: { leadId: k2, channel: "Instagram", duplicate: true } });
  assert.deepEqual(await k("&duplicated=true"), ["2"]);
  assert.deepEqual(await k("&duplicated=false"), ["1", "3"]);

  // Action date / Last action: what a person did, not the system
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  const logged = await call(`/leads/${k1}/calls`, { method: "POST", cookie: ops });
  assert.ok(logged.status < 300, JSON.stringify(logged.body));
  await prisma.leadActivity.create({ data: { leadId: k2, kind: "assign", text: "system", byUserId: null } });
  assert.deepEqual(await k(`&actionFrom=${today}&actionTo=${today}`), ["1"]);
  assert.deepEqual(await k("&action=call"), ["1"]);
  assert.deepEqual(await k("&action=visit"), []);
  assert.deepEqual(await k("&actionFrom=2020-01-01&actionTo=2020-01-02"), []);

  // Assign from: moved away from a salesperson (the transfer writes it in the audit); the one who has it now isn't «from»
  const moved = await call(`/leads/${k3}/assign`, { method: "POST", cookie: ops, body: { to: eidId } });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.deepEqual(await k(`&previousOwnerId=${amrId}`), ["3"]);
  assert.deepEqual(await k(`&previousOwnerId=${eidId}`), []);
  // Assign to: it went to that salesperson, whether it's still there (k3 with Eid) or moved on (k3 was with Amr)
  assert.deepEqual(await k(`&wentToId=${eidId}`), ["3"]);
  assert.deepEqual(await k(`&wentToId=${amrId}`), ["3"]);
  assert.deepEqual(await k(`&wentToId=${mohsenId}`), ["1", "2"]); // never moved: with him now

  // the dashboard's Showings / Meetings: a Visit / Meeting held in those days; one marked «ما اتعملتش» doesn't count
  await prisma.leadVisit.createMany({ data: [
    { leadId: k1, kind: "visit", at: new Date("2025-03-10T10:00:00Z"), outcome: "done", byUserId: opsUser.id },
    { leadId: k2, kind: "meeting", at: new Date("2025-03-10T12:00:00Z"), byUserId: opsUser.id },
    { leadId: k3, kind: "visit", at: new Date("2025-03-10T13:00:00Z"), outcome: "not_done", byUserId: opsUser.id },
  ] });
  assert.deepEqual(await k("&visit=visit&visitFrom=2025-03-10&visitTo=2025-03-10"), ["1"]);
  assert.deepEqual(await k("&visit=meeting&visitFrom=2025-03-01&visitTo=2025-03-31"), ["2"]);
  assert.deepEqual(await k("&visitFrom=2025-03-11&visitTo=2025-03-31"), []);

  // the cancel reason (client, 22 Nov): Cancellation needs one from the list, a comment is optional; the filter reads it,
  // also while the lead waits in the Draft Admin
  const stage = (id: string, body: object) => call(`/leads/${id}/stage`, { method: "PATCH", cookie: ops, body });
  assert.equal((await stage(k2, { stage: "Cancellation" })).status, 400); // no reason
  assert.equal((await stage(k2, { stage: "Cancellation", reason: "Bored" })).status, 400); // not on the list
  assert.equal((await stage(k2, { stage: "Hold", reason: "Low Budget" })).status, 400); // a reason is for Cancellation only
  const cancelled = await stage(k2, { stage: "Cancellation", reason: "Low Budget", note: "الميزانية نصّ السعر" });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: k2 }, select: { cancelReason: true } })).cancelReason, "Low Budget");
  const line = await prisma.leadActivity.findFirstOrThrow({ where: { leadId: k2, kind: "stage" }, orderBy: { at: "desc" }, select: { text: true } });
  assert.equal(line.text, "المرحلة بقت Cancellation · السبب: Low Budget · الميزانية نصّ السعر");
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: k2, action: "stage" }, orderBy: { at: "desc" }, select: { after: true } });
  assert.equal((audit.after as { cancelReason?: string }).cancelReason, "Low Budget");
  assert.deepEqual(await k("&cancelReason=Low%20Budget"), ["2"]);
  assert.deepEqual(await k("&cancelReason=Buy%20Outside"), []);
  // bulk can't cancel: each lead needs its own reason
  assert.equal((await call("/leads/batch", { method: "POST", cookie: ops, body: { ids: [k1], stage: "Cancellation" } })).status, 400);

  // «Created by» lists who entered the leads; refused: an unknown type, a budget that isn't money, dates the wrong way round
  assert.ok(((await call("/leads/options", { cookie: ops })).body as LeadOptions).creators.some((c) => c.id === opsUser.id));
  for (const q of ["&type=Villa", "&budgetMin=abc", "&actionFrom=2026-02-01&actionTo=2026-01-01", "&assignedFrom=2026-02-01&assignedTo=2026-01-01", "&action=dance", "&visit=call", "&visitFrom=2026-02-01&visitTo=2026-01-01", "&cancelReason=Bored"]) {
    assert.equal((await call(`/leads?q=x${q}`, { cookie: ops })).status, 400, q);
  }
});
