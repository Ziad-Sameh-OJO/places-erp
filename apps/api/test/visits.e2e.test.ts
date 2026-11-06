/**
 * 1.9 Visit / Meeting (M-01 3.3, 4 Nov demo meeting) against the real API and database: booking moves the lead to
 * «Follow up to …», the Alarm comes at the time (worker), Done moves it to Visit / Meeting, never backwards.
 * Mohamed Mohsen is a salesperson; Abdallah Sleem his TL; Basant is HR (no leads).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { visitAlarmTick } from "../../worker/src/processors/visit-alarm.ts";
import { call, mark, session } from "./helpers.ts";

const START = new Date();
const stamp = String(START.getTime());
mark(stamp); // the Alarms and mails name this file's leads
let mohsen: string, hr: string, mohsenUser: string;
let open: string, draft: string;
const ids: Record<string, string> = {};

before(async () => {
  [mohsen, hr] = await Promise.all(["m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  mohsenUser = emp.userId;
  const lead = (n: number, stage: string) => prisma.lead.create({ data: {
    code: `L-V${stamp}${n}`, name: `E2E ${stamp} زيارة ${n}`, phones: [`0101${stamp.slice(-7)}${n}`], area: "التجمع الخامس", type: "Rent",
    channel: "Facebook", assignedToId: emp.id, assignedAt: new Date(), createdById: "e2e", stage: stage as never, qualified: stage !== "FRESH",
  } });
  for (const [k, stage] of [["interested", "INTERESTED"], ["near", "NEAR_TO_CLOSE"], ["fresh", "FRESH"]] as const) ids[k] = (await lead(Object.keys(ids).length, stage)).id;
  const unit = (n: number, pdfStatus: string) => prisma.unit.create({ data: {
    code: `U-V${stamp}${n}`, type: "Rent", project: `مشروع ${stamp}`, area: "التجمع الخامس", space: 900 + n, condition: "Finished", pdfStatus,
  } });
  open = (await unit(1, "confirmed")).id;
  draft = (await unit(2, "draft")).id;
});

after(async () => {
  // marking a Visit writes Mohsen's day for it (7.3): the days this file opened
  await prisma.attendanceDay.deleteMany({ where: { employee: { userId: mohsenUser }, source: "visit", createdAt: { gte: START } } });
  await prisma.notification.deleteMany({ where: { text: { contains: `E2E ${stamp}` } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-V${stamp}` } } });
  await prisma.unit.deleteMany({ where: { code: { startsWith: `U-V${stamp}` } } });
  await prisma.$disconnect();
});

const book = (cookie: string, leadId: string, body: object) => call(`/leads/${leadId}/visits`, { method: "POST", cookie, body });
const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

test("the unit search: open, confirmed units by code, project or space; a draft isn't listed", async () => {
  const byProject = await call(`/leads/visit-units?q=${encodeURIComponent(`مشروع ${stamp}`)}`, { cookie: mohsen });
  assert.equal(byProject.status, 200);
  assert.deepEqual(byProject.body.map((u: { id: string }) => u.id), [open]);
  assert.deepEqual((await call(`/leads/visit-units?q=901`, { cookie: mohsen })).body.map((u: { code: string }) => u.code).filter((c: string) => c.includes(stamp)), [`U-V${stamp}1`]);
  assert.equal((await call(`/leads/visit-units`, { cookie: hr })).status, 403);
});

test("Interested + Visit → Follow up to Visit → Alarm at the time → Done → Visit", async () => {
  const r = await book(mohsen, ids.interested!, { kind: "Visit", at: soon(-1), unitIds: [open], extra: "دور 4 في مبنى B6" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.stage, "Follow up to Visit");
  const [v] = r.body.visits;
  assert.equal(v.kind, "Visit");
  assert.equal(v.due, true); // its time came, nobody marked it
  assert.deepEqual(v.units.map((u: { id: string }) => u.id), [open]);
  assert.equal(v.extra, "دور 4 في مبنى B6");

  // the worker's Alarm: once, to the salesperson, even when the job runs twice
  await visitAlarmTick();
  await visitAlarmTick();
  const alarms = await prisma.notification.findMany({ where: { userId: mohsenUser, text: { contains: `E2E ${stamp} زيارة 0` } } });
  assert.equal(alarms.length, 1);
  assert.match(alarms[0]!.text, /Alarm: ميعاد الـ Visit/);
  assert.equal(alarms[0]!.important, true);

  const done = await call(`/leads/${ids.interested}/visits/${v.id}/outcome`, { method: "POST", cookie: mohsen, body: { outcome: "done" } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.stage, "Visit");
  assert.equal(done.body.visits[0].outcome, "done");
  assert.equal(done.body.visits[0].due, false);
  // marked once
  assert.equal((await call(`/leads/${ids.interested}/visits/${v.id}/outcome`, { method: "POST", cookie: mohsen, body: { outcome: "not_done" } })).status, 400);
  // a marked visit isn't edited any more
  assert.equal((await call(`/leads/${ids.interested}/visits/${v.id}`, { method: "PUT", cookie: mohsen, body: { kind: "Visit", at: soon(60), unitIds: [] } })).status, 400);
  // audited in the same flow
  const audits = await prisma.auditLog.findMany({ where: { entity: "LeadVisit", entityId: v.id }, select: { action: true } });
  assert.deepEqual(audits.map((a) => a.action).sort(), ["create", "done"]);

  // then a Meeting: Follow up to Meeting → Meeting
  const m = await book(mohsen, ids.interested!, { kind: "Meeting", at: soon(30), unitIds: [] });
  assert.equal(m.body.stage, "Follow up to Meeting");
  const mid = m.body.visits.find((x: { kind: string }) => x.kind === "Meeting").id;
  assert.equal((await call(`/leads/${ids.interested}/visits/${mid}/outcome`, { method: "POST", cookie: mohsen, body: { outcome: "done" } })).body.stage, "Meeting");
});

test("Near to Close + Visit doesn't go back", async () => {
  const r = await book(mohsen, ids.near!, { kind: "Visit", at: soon(120), unitIds: [] });
  assert.equal(r.status, 201);
  assert.equal(r.body.stage, "Near to Close");
  const done = await call(`/leads/${ids.near}/visits/${r.body.visits[0].id}/outcome`, { method: "POST", cookie: mohsen, body: { outcome: "done" } });
  assert.equal(done.body.stage, "Near to Close");
});

test("editing the time brings a new Alarm; «معملتهاش» is recorded and the lead stays", async () => {
  const r = await book(mohsen, ids.fresh!, { kind: "Visit", at: soon(-2), unitIds: [] });
  assert.equal(r.body.stage, "Follow up to Visit");
  assert.equal(r.body.qualified, true); // a Visit qualifies the lead
  const vid = r.body.visits[0].id;
  await visitAlarmTick();
  const edited = await call(`/leads/${ids.fresh}/visits/${vid}`, { method: "PUT", cookie: mohsen, body: { kind: "Visit", at: soon(-1), unitIds: [open] } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.deepEqual(edited.body.visits[0].units.map((u: { id: string }) => u.id), [open]);
  await visitAlarmTick();
  assert.equal(await prisma.notification.count({ where: { userId: mohsenUser, text: { contains: `E2E ${stamp} زيارة 2` } } }), 2);

  const nd = await call(`/leads/${ids.fresh}/visits/${vid}/outcome`, { method: "POST", cookie: mohsen, body: { outcome: "not_done" } });
  assert.equal(nd.status, 200);
  assert.equal(nd.body.visits[0].outcome, "not_done");
  assert.equal(nd.body.stage, "Follow up to Visit");
});

test("refused: a draft unit, a bad time, HR (no leads), someone else's lead", async () => {
  assert.equal((await book(mohsen, ids.interested!, { kind: "Visit", at: soon(10), unitIds: [draft] })).status, 400);
  assert.equal((await book(mohsen, ids.interested!, { kind: "Visit", at: "بكرة", unitIds: [] })).status, 400);
  assert.equal((await book(mohsen, ids.interested!, { kind: "Lunch", at: soon(10), unitIds: [] })).status, 400);
  assert.equal((await book(hr, ids.interested!, { kind: "Visit", at: soon(10), unitIds: [] })).status, 403);
  const other = await session("mahmoud.ali@places.com"); // another team's TL: the lead is outside his scope
  assert.equal((await book(other, ids.interested!, { kind: "Visit", at: soon(10), unitIds: [] })).status, 404);
});
