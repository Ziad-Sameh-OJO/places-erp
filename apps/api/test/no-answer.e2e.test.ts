/**
 * 1.17 No Answer rotation and the New Lead from Telesales (M-01 Q5, 2.3 · 4 Nov meeting) against the real API and
 * database, the job imported with a controlled clock: the salesperson marks No Answer → 24 hours → the next one, Fresh
 * → they mark it too → 24 hours → Telesales; Telesales makes it Interested and sends it as a New Lead; Operations
 * routes it. The clock is in January 2021 (Cairo +02:00): after lead-sla.e2e's 2020 and before any real lead, so
 * neither job touches the other file's leads. Youssef Hosny and Ahmed Medhat are salespeople no other test uses;
 * Hadeer is Telesales, Heba Operations, Basant HR (no leads).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { DEFAULT_LEAD_RULES, type LeadRules } from "@places/domain";
import { noAnswerTick } from "../../worker/src/processors/no-answer.ts";
import { noAnswerReminderTick } from "../../worker/src/processors/no-answer-reminder.ts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const AREA = `E2E NA ${stamp}`;
const at = (iso: string) => new Date(`${iso}+02:00`);
type Person = { id: string; userId: string };
let s1: Person, s2: Person, hadeer: Person, heba: Person;
let c1: string, c2: string, cHadeer: string, cHeba: string, cHr: string;
let rules: LeadRules;
let skipTurnsBefore: number | undefined;
const L: Record<"rotate" | "pick" | "other" | "remind", string> = {} as never;
const more: string[] = []; // the clock test's leads

let n = 0;
const lead = async (extra: object) => (await prisma.lead.create({ data: {
  code: `L-N${stamp}${++n}`, name: `E2E ${stamp} NA ${n}`, phones: [`0103${stamp.slice(-7)}${n}`], area: AREA, type: "Rent",
  channel: "Facebook", assignedToId: s1.id, assignedAt: at("2021-01-03T10:00:00"), createdById: "e2e", ...extra,
} })).id;

before(async () => {
  const emp = (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } }, select: { id: true, userId: true } });
  [s1, s2, hadeer, heba] = await Promise.all(["youssef.hosny@places.com", "ahmed.medhat@places.com", "hadeer.tarek@places.com", "heba.salah@places.com"].map(emp));
  [c1, c2, cHadeer, cHeba, cHr] = await Promise.all(["youssef.hosny@places.com", "ahmed.medhat@places.com", "hadeer.tarek@places.com", "heba.salah@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  // pinned: lead-rules.e2e changes the saved rules while this file runs; the Telesales who receives is Hadeer
  rules = { ...DEFAULT_LEAD_RULES, noAnswer: { ...DEFAULT_LEAD_RULES.noAnswer, telesales: hadeer.userId } };
  await prisma.setting.upsert({ where: { key: "areaRouting" }, update: {}, create: { key: "areaRouting", value: {} } });
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY[${AREA}], ${JSON.stringify([s1.id, s2.id])}::jsonb) WHERE "key" = 'areaRouting'`;
  const routing = (await prisma.setting.findUnique({ where: { key: "routing" } }))?.value as { skipTurns?: Record<string, number> } | undefined;
  skipTurnsBefore = routing?.skipTurns?.[s1.id];
  L.rotate = await lead({});
  L.pick = await lead({ assignedToId: hadeer.id, ownedByTelesales: true, stage: "INTERESTED", qualified: true, rotation: 3, newLeadRequestedAt: new Date(), newLeadRequestedById: hadeer.userId });
  L.other = await lead({ stage: "NO_ANSWER", touched: true, naMarkedById: heba.id, naMarkedAt: at("2021-01-03T12:00:00") });
  L.remind = await lead({});
});

after(async () => {
  const ids = [...Object.values(L), ...more];
  await prisma.auditLog.deleteMany({ where: { entity: "Lead", entityId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { text: { contains: `E2E ${stamp}` } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-N${stamp}` } } });
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = "value" - ${AREA} WHERE "key" = 'areaRouting'`;
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", '{cursor}', ("value"->'cursor') - ${AREA}) WHERE "key" = 'routing'`;
  // the hand pick used up Youssef's next turn (Q2): put his count back
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY['skipTurns', ${s1.id}], ${JSON.stringify(skipTurnsBefore ?? 0)}::jsonb) WHERE "key" = 'routing'`;
  await prisma.$disconnect();
});

const get = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });
const stage = (cookie: string, id: string, s: string) => call(`/leads/${id}/stage`, { method: "PATCH", cookie, body: { stage: s } });
const told = (userId: string, text: string) => prisma.notification.count({ where: { userId, text: { contains: text } } });

test("No Answer → 24h → the next salesperson (Fresh) → No Answer again → 24h → Telesales; nothing twice", async () => {
  const id = L.rotate, name = `E2E ${stamp} NA 1`;
  assert.equal((await stage(c1, id, "No Answer")).status, 200);
  const marked = await get(id);
  assert.equal(marked.naMarkedById, s1.id); // the salesperson's own mark
  assert.ok(marked.naMarkedAt);
  await prisma.lead.update({ where: { id }, data: { naMarkedAt: at("2021-01-03T12:00:00") } }); // the clock of this file

  assert.equal((await noAnswerTick(at("2021-01-04T11:59:00"), rules)).next, 0);
  assert.equal((await noAnswerTick(at("2021-01-04T12:00:00"), rules)).next, 1);
  assert.equal((await noAnswerTick(at("2021-01-04T12:00:00"), rules)).next, 0); // a rerun changes nothing
  let l = await get(id);
  assert.equal(l.assignedToId, s2.id);
  assert.equal(l.stage, "FRESH");
  assert.equal(l.touched, false); // the SLA runs for the new salesperson
  assert.equal(l.rotation, 2);
  assert.equal(l.naMarkedAt, null);
  assert.equal(l.assignedAt?.toISOString(), at("2021-01-04T12:00:00").toISOString());
  assert.equal(await told(s2.userId, `ليد ${name} جالك بعد No Answer عند`), 1);
  const activity = await prisma.leadActivity.findFirstOrThrow({ where: { leadId: id, byUserId: null }, orderBy: { at: "desc" } });
  assert.match(activity.text, /^No Answer: عدّى 24 ساعة عند .+ وراح لـ .+ \(رجع Fresh\)$/);

  // the second salesperson hasn't marked it: it stays, however long (the SLA job is the one that would pull it)
  assert.equal((await noAnswerTick(at("2021-01-09T12:00:00"), rules)).next, 0);
  assert.equal((await get(id)).assignedToId, s2.id);

  assert.equal((await stage(c2, id, "No Answer")).status, 200);
  await prisma.lead.update({ where: { id }, data: { naMarkedAt: at("2021-01-06T09:00:00") } });
  assert.equal((await noAnswerTick(at("2021-01-07T09:00:00"), rules)).telesales, 1);
  assert.equal((await noAnswerTick(at("2021-01-07T09:00:00"), rules)).telesales, 0);
  l = await get(id);
  assert.equal(l.assignedToId, hadeer.id);
  assert.equal(l.ownedByTelesales, true); // no SLA while she has it
  assert.equal(l.rotation, 3);
  assert.equal(await told(hadeer.userId, `ليد ${name} رجعلك في الروتيشن التالت`), 1);
  const audits = await prisma.auditLog.findMany({ where: { entity: "Lead", entityId: id, action: "no-answer-rotate" } });
  assert.equal(audits.length, 2);

  // scope follows the lead: Telesales opens it, the salesperson it left doesn't
  assert.equal((await call(`/leads/${id}`, { cookie: cHadeer })).status, 200);
  assert.equal((await call(`/leads/${id}`, { cookie: c2 })).status, 404);
});

test("Telesales sends it as a New Lead once it's Interested; Operations sees the clock and routes it by the rotation", async () => {
  const id = L.rotate;
  assert.equal((await call(`/leads/new-leads/${id}`, { method: "POST", cookie: cHadeer })).status, 400); // not Interested yet
  assert.equal((await stage(cHadeer, id, "Interested")).status, 200);
  assert.equal((await call(`/leads/new-leads/${id}`, { method: "POST", cookie: cHr })).status, 403);
  assert.equal((await call(`/leads/new-leads/${id}`, { method: "POST", cookie: c1 })).status, 404); // not his lead
  const sent = await call(`/leads/new-leads/${id}`, { method: "POST", cookie: cHadeer });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.newLeadPending, true);
  assert.equal((await call(`/leads/new-leads/${id}`, { method: "POST", cookie: cHadeer })).status, 400); // already waiting
  assert.equal(await told(heba.userId, `Telesales بعتت E2E ${stamp} NA 1 كـ New Lead`), 1);

  assert.equal((await call("/leads/new-leads", { cookie: c1 })).status, 403);
  const queue = await call("/leads/new-leads", { cookie: cHeba });
  assert.equal(queue.status, 200);
  const row = queue.body.find((r: { id: string }) => r.id === id);
  assert.ok(row && row.minutesLeft <= 30 && row.minutesLeft >= 29, JSON.stringify(row));
  assert.equal(row.by.id, hadeer.userId);

  assert.equal((await call(`/leads/new-leads/${id}/route`, { method: "POST", cookie: c1, body: { to: "rotation" } })).status, 403);
  const routed = await call(`/leads/new-leads/${id}/route`, { method: "POST", cookie: cHeba, body: { to: "rotation" } });
  assert.equal(routed.status, 201, JSON.stringify(routed.body));
  assert.ok([s1.id, s2.id].includes(routed.body.assignedTo.id));
  assert.equal(routed.body.stage, "Fresh");
  assert.equal(routed.body.rotation, 1);
  assert.equal(routed.body.ownedByTelesales, false);
  assert.equal(routed.body.newLeadPending, false);
  assert.equal(routed.body.qualified, true); // Qualified stays (sticky)
  assert.equal((await call(`/leads/new-leads/${id}/route`, { method: "POST", cookie: cHeba, body: { to: "rotation" } })).status, 409);
  const l = await get(id);
  assert.ok(l.newLeadRequestedAt && l.newLeadRoutedAt && l.newLeadRoutedById); // both times, for 11.15
  assert.ok(!(await call("/leads/new-leads", { cookie: cHeba })).body.some((r: { id: string }) => r.id === id));
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Lead", entityId: id, action: "new-lead-route" } });
  assert.equal((audit.after as { by: string }).by, "rotation");
});

test("Operations picks a salesperson by hand: the lead goes to them and their next turn is used up", async () => {
  const bad = await call(`/leads/new-leads/${L.pick}/route`, { method: "POST", cookie: cHeba, body: { to: hadeer.id } });
  assert.equal(bad.status, 400); // only salespeople
  const before = ((await prisma.setting.findUniqueOrThrow({ where: { key: "routing" } })).value as { skipTurns: Record<string, number> }).skipTurns[s1.id] ?? 0;
  const r = await call(`/leads/new-leads/${L.pick}/route`, { method: "POST", cookie: cHeba, body: { to: s1.id } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.assignedTo.id, s1.id);
  const after = ((await prisma.setting.findUniqueOrThrow({ where: { key: "routing" } })).value as { skipTurns: Record<string, number> }).skipTurns[s1.id];
  assert.equal(after, before + 1);
  const activity = await prisma.leadActivity.findFirstOrThrow({ where: { leadId: L.pick }, orderBy: { at: "desc" } });
  assert.match(activity.text, /^الأوبريشن بعتت الليد كـ New Lead لـ .+ · بعد \d+ دقيقة من استلامه$/);
});

// Here, not in a file of its own: this file's queue check above expects the 30 minutes, and tests in one file run in turn.
// 40 minutes / 26 hours leave kpi-ops.e2e's in-time and late rows as they are while it runs.
test("4 Nov meeting: the New Lead and Draft clocks follow Operations' KPI items (11.15), not a number in the code", async () => {
  // every quarter's: kpis.e2e may start the next quarter (a copy of these cards) while this runs
  const items = await prisma.kpiItem.findMany({ where: { card: { employeeId: heba.id }, metric: { in: ["newLeadRoute", "draftAction"] } }, select: { id: true, metric: true, params: true } });
  assert.ok(items.length >= 2);
  const MIN = 60_000;
  try {
    for (const it of items) await prisma.kpiItem.update({ where: { id: it.id }, data: { params: { ...(it.params as object), ...(it.metric === "newLeadRoute" ? { min: 40 } : { hours: 26 }) } } });
    // a request 35 minutes old: late at 30, still in time at 40
    const req = await lead({ assignedToId: hadeer.id, ownedByTelesales: true, stage: "INTERESTED", rotation: 3, newLeadRequestedAt: new Date(Date.now() - 35 * MIN), newLeadRequestedById: hadeer.userId });
    more.push(req);
    assert.equal((await call("/leads/new-leads", { cookie: c1 })).status, 403);
    const row = (await call("/leads/new-leads", { cookie: cHeba })).body.find((r: { id: string }) => r.id === req);
    assert.ok(row && row.minutesLeft <= 5 && row.minutesLeft >= 4, JSON.stringify(row));
    assert.equal((await call(`/leads/new-leads/${req}/route`, { method: "POST", cookie: cHeba, body: { to: "rotation" } })).status, 201);
    const routed = await prisma.leadActivity.findFirstOrThrow({ where: { leadId: req, text: { startsWith: "الأوبريشن بعتت" } } });
    assert.doesNotMatch(routed.text, /اتأخر/);

    // a Draft that came an hour ago: 25 hours left of 26
    const drafted = await lead({ draft: "draft", assignedToId: null, stage: "INTERESTED" });
    more.push(drafted);
    await prisma.leadDraft.create({ data: { leadId: drafted, kind: "draft", at: new Date(Date.now() - 60 * MIN), fromId: s1.id, stage: "INTERESTED" } });
    assert.equal((await call("/leads/drafts?kind=draft", { cookie: c1 })).status, 403);
    const d = (await call("/leads/drafts?kind=draft", { cookie: cHeba })).body.find((r: { lead: { id: string } }) => r.lead.id === drafted);
    assert.ok(d && d.minutesLeft <= 25 * 60 && d.minutesLeft >= 25 * 60 - 1, JSON.stringify(d));
  } finally {
    for (const it of items) await prisma.kpiItem.update({ where: { id: it.id }, data: { params: it.params as object } });
  }
});

test("a No Answer someone else marked doesn't move the lead: the salesperson who has it must try first", async () => {
  await noAnswerTick(at("2021-01-20T12:00:00"), rules);
  const l = await get(L.other);
  assert.equal(l.assignedToId, s1.id);
  assert.equal(l.stage, "NO_ANSWER");
});

test("1.18 the «كلّم» Alarm every 4 working hours while in No Answer; a logged call restarts it; the WhatsApp answer is a comment", async () => {
  const id = L.remind, text = `Alarm: كلّم E2E ${stamp} NA 4 (No Answer)`;
  assert.equal((await stage(c1, id, "No Answer")).status, 200);
  await prisma.lead.update({ where: { id }, data: { naMarkedAt: at("2021-01-10T11:00:00") } }); // a Sunday
  await noAnswerReminderTick(at("2021-01-10T14:59:00"), rules);
  assert.equal(await told(s1.userId, text), 0);
  await noAnswerReminderTick(at("2021-01-10T15:00:00"), rules);
  await noAnswerReminderTick(at("2021-01-10T15:00:00"), rules); // a rerun sends nothing more
  assert.equal(await told(s1.userId, text), 1);
  // a call at 16:00 restarts the clock: 3 hours that day, the 4th on Monday at 12:00
  await prisma.leadCall.create({ data: { leadId: id, byUserId: s1.userId, at: at("2021-01-10T16:00:00") } });
  await noAnswerReminderTick(at("2021-01-11T11:59:00"), rules);
  assert.equal(await told(s1.userId, text), 1);
  await noAnswerReminderTick(at("2021-01-11T12:00:00"), rules);
  assert.equal(await told(s1.userId, text), 2);
  // «بعتله واتساب؟» → a comment on the lead (the drawer sends it through the comments endpoint)
  assert.equal((await call(`/leads/${id}/comments`, { method: "POST", cookie: c1, body: { text: "No Answer · بعتله واتساب" } })).status, 201);
  const detail = (await call(`/leads/${id}`, { cookie: c1 })).body;
  assert.ok(detail.activities.some((a: { kind: string; text: string }) => a.kind === "comment" && a.text === "No Answer · بعتله واتساب"));
  // the summary carries the rules the question's note quotes
  assert.deepEqual(Object.keys((await call("/leads/summary?kind=client", { cookie: c1 })).body.noAnswerRules).sort(), ["hours", "remindH"]);
});
