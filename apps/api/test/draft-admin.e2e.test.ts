/**
 * 1.27 the Draft Admin (4 Nov meeting) against the real API and database: Not Interested / Cancellation leaves whoever
 * had it (a salesperson or Telesales) for the Draft Admin, seen only by Operations, with a daily Alarm; Operations
 * keeps it there or sends it on (rotation, Telesales, a salesperson), and it starts again as Fresh. Ahmed Khaled and
 * Ziad Medhat are salespeople no other test uses; Hadeer is Telesales, Heba Operations.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { DEFAULT_LEAD_RULES } from "@places/domain";
import { draftAdminAlarmTick } from "../../worker/src/processors/draft-admin-alarm.ts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
type Person = { id: string; userId: string };
let s1: Person, s2: Person, hadeer: Person, heba: Person;
let c1: string, cHadeer: string, cHeba: string;
let skipBefore: number | undefined;
const L: Record<"toTelesales" | "toSales" | "kept", string> = {} as never;

let n = 0;
const lead = async (extra: object) => (await prisma.lead.create({ data: {
  code: `L-A${stamp}${++n}`, name: `E2E ${stamp} DA ${n}`, phones: [`0105${stamp.slice(-7)}${n}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
  assignedToId: s1.id, assignedAt: new Date(), createdById: "e2e", stage: "INTERESTED", qualified: true, touched: true, ...extra,
} })).id;

before(async () => {
  const emp = (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } }, select: { id: true, userId: true } });
  [s1, s2, hadeer, heba] = await Promise.all(["ahmed.khaled@places.com", "ziad.medhat@places.com", "hadeer.tarek@places.com", "heba.salah@places.com"].map(emp));
  [c1, cHadeer, cHeba] = await Promise.all(["ahmed.khaled@places.com", "hadeer.tarek@places.com", "heba.salah@places.com"].map((e) => session(e)));
  skipBefore = ((await prisma.setting.findUnique({ where: { key: "routing" } }))?.value as { skipTurns?: Record<string, number> } | undefined)?.skipTurns?.[s2.id];
  L.toTelesales = await lead({});
  L.toSales = await lead({});
  L.kept = await lead({ assignedToId: hadeer.id, ownedByTelesales: true });
});

after(async () => {
  const ids = Object.values(L);
  const stays = (await prisma.leadDraft.findMany({ where: { leadId: { in: ids } }, select: { id: true } })).map((d) => d.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...stays] } } });
  await prisma.notification.deleteMany({ where: { text: { contains: `E2E ${stamp}` } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-A${stamp}` } } });
  await prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY['skipTurns', ${s2.id}], ${JSON.stringify(skipBefore ?? 0)}::jsonb) WHERE "key" = 'routing'`;
  await prisma.$disconnect();
});

const get = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });
const stayOf = (leadId: string) => prisma.leadDraft.findFirstOrThrow({ where: { leadId, kind: "admin" } });
const stage = (cookie: string, id: string, s: string) => call(`/leads/${id}/stage`, { method: "PATCH", cookie, body: { stage: s } });
const decide = (cookie: string, id: string, to: string) => call(`/leads/drafts/${id}/decide`, { method: "POST", cookie, body: { to } });
const adminTab = (cookie: string) => call("/leads/drafts?kind=admin", { cookie });

test("Not Interested / Cancellation → gone from the salesperson and Telesales, in the Draft Admin; Operations told", async () => {
  assert.equal((await stage(c1, L.toTelesales, "Not Interested")).status, 200);
  assert.equal((await stage(c1, L.toSales, "Cancellation")).status, 200);
  assert.equal((await stage(cHadeer, L.kept, "Not Interested")).status, 200);
  for (const id of Object.values(L)) {
    const l = await get(id);
    assert.equal(l.draft, "admin");
    assert.equal(l.assignedToId, null);
  }
  assert.equal((await stayOf(L.toTelesales)).fromId, s1.id);
  assert.equal((await stayOf(L.toSales)).stage, "CANCELLATION");
  assert.equal((await stayOf(L.kept)).fromId, hadeer.id);
  assert.equal((await call(`/leads/${L.toTelesales}`, { cookie: c1 })).status, 404);
  assert.equal((await call(`/leads/${L.kept}`, { cookie: cHadeer })).status, 404);
  assert.equal(await prisma.notification.count({ where: { userId: heba.userId, text: { contains: `E2E ${stamp} DA 1 (L-A${stamp}1) بقى Not Interested عند` } } }), 1);

  assert.equal((await adminTab(c1)).status, 403);
  const tab = await adminTab(cHeba);
  assert.equal(tab.status, 200);
  assert.equal(tab.body.filter((d: { lead: { id: string } }) => Object.values(L).includes(d.lead.id)).length, 3);
  const summary = (await call("/leads/summary?kind=client", { cookie: cHeba })).body;
  assert.ok(summary.draftAdmin.waiting >= 3 && summary.draftAdmin.today >= 3);
  assert.equal((await call("/leads/summary?kind=client", { cookie: c1 })).body.draftAdmin, null);
});

test("the daily Alarm: once a day, to Operations, with how many wait and how many came today", async () => {
  await prisma.setting.upsert({ where: { key: "draftAdminAlarm" }, update: { value: "" }, create: { key: "draftAdminAlarm", value: "" } });
  assert.ok((await draftAdminAlarmTick(new Date(), DEFAULT_LEAD_RULES)) >= 1);
  assert.equal(await draftAdminAlarmTick(new Date(), DEFAULT_LEAD_RULES), 0); // the same day: nothing more
  const alarm = await prisma.notification.findFirstOrThrow({ where: { userId: heba.userId, text: { startsWith: "Alarm: " }, important: true }, orderBy: { createdAt: "desc" } });
  assert.match(alarm.text, /^Alarm: \d+ Not Interested \/ Cancellation مستنيين قرارك · \d+ النهارده$/);
  await prisma.notification.delete({ where: { id: alarm.id } });
});

test("Operations decides: Telesales · a salesperson (Fresh again) · keep; the decision closes the Alarm", async () => {
  const before = (await call("/leads/summary?kind=client", { cookie: cHeba })).body.draftAdmin.waiting;
  const tele = await decide(cHeba, (await stayOf(L.toTelesales)).id, "telesales");
  assert.equal(tele.status, 201, JSON.stringify(tele.body));
  let l = await get(L.toTelesales);
  // the rules' Telesales, or the first one by name when none is chosen (other files may add Telesales accounts)
  const teleEmp = await prisma.employee.findUniqueOrThrow({ where: { id: l.assignedToId! }, select: { userId: true, user: { select: { roles: { select: { role: { select: { key: true } } } } } } } });
  assert.ok(teleEmp.user.roles.some((r) => r.role.key === "telesales"));
  assert.equal(l.ownedByTelesales, true);
  assert.equal(l.stage, "FRESH");
  assert.equal(l.draft, null);
  assert.equal((await stayOf(L.toTelesales)).decision, "telesales");
  assert.equal(await prisma.notification.count({ where: { userId: teleEmp.userId, text: `ليد E2E ${stamp} DA 1 اتبعتلك من الـ Draft Admin` } }), 1);

  assert.equal((await decide(c1, (await stayOf(L.toSales)).id, s2.id)).status, 403);
  assert.equal((await decide(cHeba, (await stayOf(L.toSales)).id, s2.id)).status, 201);
  l = await get(L.toSales);
  assert.equal(l.assignedToId, s2.id);
  assert.equal(l.stage, "FRESH");
  assert.equal(l.touched, false); // the SLA runs for him
  assert.match((await prisma.leadActivity.findFirstOrThrow({ where: { leadId: L.toSales }, orderBy: { at: "desc" } })).text, /^اتبعت من الـ Draft Admin لـ .+ \(كان Cancellation عند .+\) · رجع Fresh$/);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Lead", entityId: L.toSales, action: "draft-route" } }), 1);

  assert.equal((await decide(cHeba, (await stayOf(L.kept)).id, "keep")).status, 201);
  assert.equal((await get(L.kept)).draft, "admin"); // stays, reviewed
  const after = (await call("/leads/summary?kind=client", { cookie: cHeba })).body.draftAdmin.waiting;
  assert.equal(after, before - 3);
  assert.ok((await adminTab(cHeba)).body.find((d: { lead: { id: string } }) => d.lead.id === L.kept).kept);
});
