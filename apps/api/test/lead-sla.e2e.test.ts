/**
 * 1.16 the SLA job (M-01 Q4, 2.4) against the real database and API, with a controlled clock: the warning once at
 * 2h30 of working time, the pull at 3h to the next salesperson of the area, the holiday times on an official holiday
 * range, nothing twice when the job runs again. The clock is set in January 2020 (Cairo +02:00, before any real
 * lead), so the job leaves the other test files’ leads alone, and every lead is created up front so the salespeople's
 * counts don't change under the other files. Ibrahim Samir and Mohamed Khaled are salespeople no other test uses; Heba is
 * Operations (told of a pull by default), Abdallah Sleem a Team Leader (warned by default). The rules are pinned to the
 * defaults: lead-rules.e2e changes the saved ones while this file runs.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { DEFAULT_LEAD_RULES } from "@places/domain";
import { leadSlaTick } from "../../worker/src/processors/lead-sla.ts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const AREA = `E2E SLA ${stamp}`;
const at = (iso: string) => new Date(`${iso}+02:00`);
let sales1: { id: string; userId: string }, sales2: { id: string; userId: string }, heba: string, abdallah: string;
let cookie1: string, cookie2: string;
const L: Record<"main" | "touched" | "interested" | "telesales" | "evening" | "eid", { id: string; code: string; name: string }> = {} as never;

before(async () => {
  const emp = (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } }, select: { id: true, userId: true } });
  [sales1, sales2] = await Promise.all([emp("ibrahim.samir@places.com"), emp("m.khaled@places.com")]);
  [heba, abdallah] = (await Promise.all([emp("heba.salah@places.com"), emp("abdallah.sleem@places.com")])).map((e) => e.userId);
  [cookie1, cookie2] = await Promise.all([session("ibrahim.samir@places.com"), session("m.khaled@places.com")]);
  await prisma.setting.upsert({ where: { key: "areaRouting" }, update: {}, create: { key: "areaRouting", value: {} } });
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY[${AREA}], ${JSON.stringify([sales1.id, sales2.id])}::jsonb) WHERE "key" = 'areaRouting'`;
  L.main = await lead(at("2020-01-05T11:00:00")); // a Sunday
  L.touched = await lead(at("2020-01-05T11:00:00"), { touched: true });
  L.interested = await lead(at("2020-01-05T11:00:00"), { stage: "INTERESTED" });
  L.telesales = await lead(at("2020-01-05T11:00:00"), { ownedByTelesales: true });
  L.evening = await lead(at("2020-01-09T18:00:00")); // a Thursday evening
  L.eid = await lead(at("2020-01-12T10:00:00")); // the first day of the holiday range below
  await prisma.holiday.create({ data: { from: new Date("2020-01-12"), to: new Date("2020-01-13"), label: `E2E SLA ${stamp}` } });
});

after(async () => {
  const leads = await prisma.lead.findMany({ where: { code: { startsWith: `L-S${stamp}` } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entity: "Lead", entityId: { in: leads.map((l) => l.id) } } });
  await prisma.notification.deleteMany({ where: { text: { contains: `E2E ${stamp}` } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-S${stamp}` } } });
  await prisma.holiday.deleteMany({ where: { label: `E2E SLA ${stamp}` } });
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = "value" - ${AREA} WHERE "key" = 'areaRouting'`;
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", '{cursor}', ("value"->'cursor') - ${AREA}) WHERE "key" = 'routing'`;
  await prisma.$disconnect();
});

let n = 0;
const lead = (assignedAt: Date, extra: object = {}) => prisma.lead.create({ data: {
  code: `L-S${stamp}${++n}`, name: `E2E ${stamp} SLA ${n}`, phones: [`0102${stamp.slice(-7)}${n}`], area: AREA, type: "Rent",
  channel: "Facebook", assignedToId: sales1.id, assignedAt, createdById: "e2e", ...extra,
} });
const told = (userId: string, text: string) => prisma.notification.findMany({ where: { userId, text: { contains: text } } });

test("2h30 of working time → the Team Leaders are warned once; 3h → pulled to the next salesperson, Operations told", async () => {
  const l = L.main, name = l.name;

  assert.equal((await leadSlaTick(at("2020-01-05T13:29:00"), DEFAULT_LEAD_RULES)).warned, 0);
  assert.equal((await leadSlaTick(at("2020-01-05T13:30:00"), DEFAULT_LEAD_RULES)).warned, 1);
  assert.equal((await leadSlaTick(at("2020-01-05T13:45:00"), DEFAULT_LEAD_RULES)).warned, 0); // never twice
  const warns = await told(abdallah, `تنبيه SLA: ${name}`);
  assert.equal(warns.length, 1);
  assert.ok(warns[0]!.text.startsWith(`تنبيه SLA: ${name} (${l.code}) من غير أكشن عند `), warns[0]!.text);
  assert.equal(warns[0]!.important, true);
  assert.ok((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).slaWarnedAt);

  const pulled = await leadSlaTick(at("2020-01-05T14:00:00"), DEFAULT_LEAD_RULES);
  assert.equal(pulled.pulled, 1);
  const moved = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(moved.assignedToId, sales2.id);
  assert.equal(moved.assignedAt?.toISOString(), at("2020-01-05T14:00:00").toISOString()); // a fresh clock with the new salesperson
  assert.equal(moved.slaWarnedAt, null);
  assert.equal((await leadSlaTick(at("2020-01-05T14:00:00"), DEFAULT_LEAD_RULES)).pulled, 0); // a rerun at the same minute changes nothing

  const activity = await prisma.leadActivity.findFirstOrThrow({ where: { leadId: l.id } });
  assert.match(activity.text, /^اتسحب أوتوماتيك من .+ بعد 3 ساعات من غير أكشن، وراح لـ .+$/);
  const audit = await prisma.auditLog.findMany({ where: { entity: "Lead", entityId: l.id, action: "auto-pull" } });
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0]!.after, { assignedToId: sales2.id, assignedAt: at("2020-01-05T14:00:00").toISOString() });
  assert.equal((await told(heba, `الليد ${l.code} (${name}) اتسحب`)).length, 1);

  // scope follows the lead: the new salesperson opens it, the one it was pulled from no longer can
  assert.equal((await call(`/leads/${l.id}`, { cookie: cookie2 })).status, 200);
  assert.equal((await call(`/leads/${l.id}`, { cookie: cookie1 })).status, 404);

  // with the next salesperson it starts again: warned at his own 2h30, pulled back to the rotation's next at 3h
  assert.equal((await leadSlaTick(at("2020-01-05T16:30:00"), DEFAULT_LEAD_RULES)).warned, 1);
  assert.equal((await leadSlaTick(at("2020-01-05T17:00:00"), DEFAULT_LEAD_RULES)).pulled, 1);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).assignedToId, sales1.id);
});

test("an action stops the clock: a touched, non-Fresh or Telesales lead is never warned nor pulled", async () => {
  await leadSlaTick(at("2020-01-05T18:00:00"), DEFAULT_LEAD_RULES);
  for (const l of [L.touched, L.interested, L.telesales]) {
    const now = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(now.assignedToId, sales1.id);
    assert.equal(now.slaWarnedAt, null);
  }
});

test("after hours the clock waits: a lead that came Thursday 18:00 is pulled Saturday 13:00 (Friday off)", async () => {
  const l = L.evening;
  await leadSlaTick(at("2020-01-10T23:00:00"), DEFAULT_LEAD_RULES); // Friday night: still 1 working hour
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).slaWarnedAt, null);
  await leadSlaTick(at("2020-01-11T12:59:00"), DEFAULT_LEAD_RULES);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).assignedToId, sales1.id);
  await leadSlaTick(at("2020-01-11T13:00:00"), DEFAULT_LEAD_RULES);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).assignedToId, sales2.id);
});

test("on an official holiday range the holiday times apply: warn at 22 hours, pull at 24", async () => {
  const l = L.eid; // the holiday is 12–13 January
  await leadSlaTick(at("2020-01-12T14:00:00"), DEFAULT_LEAD_RULES); // a working day would have pulled it by now
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).assignedToId, sales1.id);
  assert.equal((await leadSlaTick(at("2020-01-13T08:00:00"), DEFAULT_LEAD_RULES)).warned >= 1, true);
  assert.ok((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).slaWarnedAt);
  await leadSlaTick(at("2020-01-13T09:59:00"), DEFAULT_LEAD_RULES);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).assignedToId, sales1.id);
  await leadSlaTick(at("2020-01-13T10:00:00"), DEFAULT_LEAD_RULES);
  const moved = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(moved.assignedToId, sales2.id);
  assert.match((await prisma.leadActivity.findFirstOrThrow({ where: { leadId: l.id } })).text, /بعد 24 ساعة من غير أكشن/);
});
