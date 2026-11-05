/**
 * 1.26 the Draft (4 Nov meeting) against the real API and database, the job imported with a controlled clock: 7 days
 * without a touch → the Draft (Hold: 10 days stays, 15 goes), hidden from the salesperson and the lists, seen by
 * Operations only, who keep it there or send it on. The clock is in January 2022 (Cairo +02:00) and every lead here
 * was created then: the job judges by the last touch, so it leaves every other file's leads (created now) alone.
 * Salah Eldin and Mohamed Mamdouh are salespeople no other test uses; Heba is Operations, Basant HR.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { DEFAULT_LEAD_RULES } from "@places/domain";
import { draftTick } from "../../worker/src/processors/draft.ts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const AREA = `E2E DR ${stamp}`;
const at = (iso: string) => new Date(`${iso}+02:00`);
type Person = { id: string; userId: string };
let s1: Person, s2: Person, heba: Person;
let c1: string, cHeba: string, cHr: string;
let skipTurnsBefore: Record<string, number | undefined> = {};
const L: Record<"idle" | "hold" | "noAnswer" | "commented", string> = {} as never;

let n = 0;
const lead = async (stage: string, extra: object = {}) => (await prisma.lead.create({ data: {
  code: `L-D${stamp}${++n}`, name: `E2E ${stamp} DR ${n}`, phones: [`0104${stamp.slice(-7)}${n}`], area: AREA, type: "Rent", channel: "Facebook",
  assignedToId: s1.id, assignedAt: at("2022-01-02T10:00:00"), createdAt: at("2022-01-02T10:00:00"), createdById: "e2e", stage: stage as never, touched: true, ...extra,
} })).id;
const rules = DEFAULT_LEAD_RULES; // pinned: lead-rules.e2e changes the saved rules while this file runs

before(async () => {
  const emp = (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } }, select: { id: true, userId: true } });
  [s1, s2, heba] = await Promise.all(["salah.eldin@places.com", "m.mamdouh@places.com", "heba.salah@places.com"].map(emp));
  [c1, cHeba, cHr] = await Promise.all(["salah.eldin@places.com", "heba.salah@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  await prisma.setting.upsert({ where: { key: "areaRouting" }, update: {}, create: { key: "areaRouting", value: {} } });
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY[${AREA}], ${JSON.stringify([s1.id, s2.id])}::jsonb) WHERE "key" = 'areaRouting'`;
  const routing = (await prisma.setting.findUnique({ where: { key: "routing" } }))?.value as { skipTurns?: Record<string, number> } | undefined;
  skipTurnsBefore = { [s1.id]: routing?.skipTurns?.[s1.id], [s2.id]: routing?.skipTurns?.[s2.id] };
  L.idle = await lead("INTERESTED", { qualified: true });
  L.hold = await lead("HOLD");
  L.noAnswer = await lead("NO_ANSWER");
  L.commented = await lead("INTERESTED");
  await prisma.leadActivity.create({ data: { leadId: L.commented, kind: "comment", text: "اتكلمنا", byUserId: s1.userId, at: at("2022-01-05T10:00:00") } });
});

after(async () => {
  const ids = Object.values(L);
  await prisma.auditLog.deleteMany({ where: { entity: "Lead", entityId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entity: "LeadDraft", entityId: { in: (await prisma.leadDraft.findMany({ where: { leadId: { in: ids } }, select: { id: true } })).map((d) => d.id) } } });
  await prisma.notification.deleteMany({ where: { text: { contains: `E2E ${stamp}` } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-D${stamp}` } } });
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = "value" - ${AREA} WHERE "key" = 'areaRouting'`;
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", '{cursor}', ("value"->'cursor') - ${AREA}) WHERE "key" = 'routing'`;
  // the hand picks used up these two's next turns (Q2): put their counts back
  for (const [id, v] of Object.entries(skipTurnsBefore)) {
    await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY['skipTurns', ${id}], ${JSON.stringify(v ?? 0)}::jsonb) WHERE "key" = 'routing'`;
  }
  await prisma.$disconnect();
});

const get = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });
const drafts = (cookie: string) => call("/leads/drafts?kind=draft", { cookie });
const decide = (cookie: string, id: string, to: string) => call(`/leads/drafts/${id}/decide`, { method: "POST", cookie, body: { to } });
const draftOf = async (leadId: string) => (await prisma.leadDraft.findFirstOrThrow({ where: { leadId }, orderBy: { at: "desc" } }));

test("7 days without a touch → the Draft: out of the salesperson's hands, Operations and the salesperson told; once", async () => {
  await draftTick(at("2022-01-09T09:59:00"), rules);
  assert.equal((await get(L.idle)).draft, null);
  await draftTick(at("2022-01-09T10:00:00"), rules);
  await draftTick(at("2022-01-09T10:00:00"), rules); // a rerun changes nothing
  const l = await get(L.idle);
  assert.equal(l.draft, "draft");
  assert.equal(l.assignedToId, null);
  const stays = await prisma.leadDraft.findMany({ where: { leadId: L.idle } });
  assert.equal(stays.length, 1);
  assert.equal(stays[0]!.fromId, s1.id);
  assert.equal(stays[0]!.days, 7);
  assert.equal(stays[0]!.stage, "INTERESTED");
  const text = `E2E ${stamp} DR 1 (L-D${stamp}1) اتسحب من`;
  assert.equal(await prisma.notification.count({ where: { userId: heba.userId, text: { contains: text } } }), 1);
  assert.equal(await prisma.notification.count({ where: { userId: s1.userId, text: { contains: text } } }), 1);
  assert.match((await prisma.leadActivity.findFirstOrThrow({ where: { leadId: L.idle, byUserId: null } })).text, /^اتسحب أوتوماتيك من .+ للـ Draft بعد 7 يوم من غير أكشن$/);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Lead", entityId: L.idle, action: "to-draft" } }), 1);
  // a comment 3 days later moves the clock; No Answer is never pulled here
  assert.equal((await get(L.commented)).draft, null);
  assert.equal((await get(L.noAnswer)).draft, null);
});

test("Hold waits 14 days: 10 days stays, 15 goes", async () => {
  await draftTick(at("2022-01-12T10:00:00"), rules);
  assert.equal((await get(L.hold)).draft, null);
  assert.equal((await get(L.commented)).draft, "draft"); // 7 days after its comment
  await draftTick(at("2022-01-17T10:00:00"), rules);
  assert.equal((await get(L.hold)).draft, "draft");
  assert.equal((await draftOf(L.hold)).days, 14);
  assert.equal((await get(L.noAnswer)).draft, null);
});

test("only Operations sees the Draft; the salesperson and the lists don't", async () => {
  assert.equal((await call(`/leads/${L.idle}`, { cookie: c1 })).status, 404);
  assert.equal((await drafts(c1)).status, 403);
  assert.equal((await drafts(cHr)).status, 403);
  const list = await drafts(cHeba);
  assert.equal(list.status, 200);
  const row = list.body.find((d: { lead: { id: string } }) => d.lead.id === L.idle);
  assert.ok(row, "the idle lead is in the Draft tab");
  assert.equal(row.from.id, s1.id);
  assert.equal(row.lead.stage, "Interested");
  assert.equal(row.days, 7);
  assert.equal(row.kept, false);
  // not in Operations' list, nor counted in the tiles; the Draft tab's count is there for her only
  const found = (await call(`/leads?q=${encodeURIComponent(`E2E ${stamp} DR`)}`, { cookie: cHeba })).body.items.map((x: { id: string }) => x.id);
  assert.deepEqual(found, [L.noAnswer]); // the three in the Draft are gone from the list
  const summary = (await call("/leads/summary?kind=client", { cookie: cHeba })).body;
  assert.ok(summary.drafts >= 3);
  assert.deepEqual(summary.draftRules, { days: 7, holdDays: 14 });
  assert.equal((await call("/leads/summary?kind=client", { cookie: c1 })).body.drafts, null);
});

test("Operations decides: keep (once) · a salesperson · back to the same one · the rotation; audited, told, never twice", async () => {
  const idle = (await draftOf(L.idle)).id;
  assert.equal((await decide(c1, idle, "keep")).status, 403);
  assert.equal((await decide(cHeba, idle, "keep")).status, 201);
  assert.equal((await decide(cHeba, idle, "keep")).status, 400); // already reviewed
  assert.equal((await draftOf(L.idle)).keptById, heba.userId);
  assert.equal((await drafts(cHeba)).body.find((d: { id: string }) => d.id === idle).kept, true);

  const sent = await decide(cHeba, idle, s2.id);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  let l = await get(L.idle);
  assert.equal(l.draft, null);
  assert.equal(l.assignedToId, s2.id);
  assert.equal(l.stage, "INTERESTED"); // the stage stays (demo)
  const d = await draftOf(L.idle);
  assert.ok(d.decidedAt && d.keptAt);
  assert.equal(d.decision, "hand");
  assert.equal((await decide(cHeba, idle, s2.id)).status, 409);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Lead", entityId: L.idle, action: "draft-route" } }), 1);
  assert.equal(await prisma.notification.count({ where: { userId: s2.userId, text: `ليد E2E ${stamp} DR 1 اتحوّلك من الـ Draft` } }), 1);
  assert.match((await prisma.leadActivity.findFirstOrThrow({ where: { leadId: L.idle }, orderBy: { at: "desc" } })).text, /^اتوزع من الـ Draft لـ .+$/);

  const back = await decide(cHeba, (await draftOf(L.commented)).id, s1.id);
  assert.equal(back.status, 201);
  assert.equal((await get(L.commented)).assignedToId, s1.id);
  assert.equal((await draftOf(L.commented)).decision, "back");
  assert.equal((await call(`/leads/${L.commented}`, { cookie: c1 })).status, 200); // his again

  const rotation = await decide(cHeba, (await draftOf(L.hold)).id, "rotation");
  assert.equal(rotation.status, 201);
  l = await get(L.hold);
  assert.ok([s1.id, s2.id].includes(l.assignedToId!));
  assert.equal(l.draft, null);
  assert.equal((await draftOf(L.hold)).decision, "rotation");
  assert.ok(!(await drafts(cHeba)).body.some((x: { lead: { id: string } }) => Object.values(L).includes(x.lead.id)));
});
