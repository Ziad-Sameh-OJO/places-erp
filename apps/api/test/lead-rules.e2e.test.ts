/**
 * 1.29 · «قواعد الليدز والتوزيع»: who reads / changes the rules, bad combinations and unknown people refused, every
 * change audited, the leads list's SLA follows them (pull after 2 hours), and a holiday added from the page makes
 * today a holiday. The rules and holidays are put back as they were.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { DEFAULT_LEAD_RULES, PLACES_CALENDAR, calendarOf, holidayDays, workingMinutesBetween, type LeadRules } from "@places/domain";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
let admin: string, ops: string, sales: string, saved: unknown;
const leads: string[] = [];
const holidays: string[] = [];

before(async () => {
  [admin, ops, sales] = await Promise.all(["ahmed.islam@places.com", "heba.salah@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  saved = (await prisma.setting.findUnique({ where: { key: "leadRules" } }))?.value;
});
after(async () => {
  if (saved === undefined) await prisma.setting.deleteMany({ where: { key: "leadRules" } });
  else await prisma.setting.update({ where: { key: "leadRules" }, data: { value: saved as never } });
  await prisma.holiday.deleteMany({ where: { id: { in: holidays } } });
  await prisma.lead.deleteMany({ where: { id: { in: leads } } });
  await prisma.$disconnect();
});

const rules = async () => (await call("/leads/rules", { cookie: admin })).body as LeadRules;
const put = (cookie: string, body: unknown) => call("/leads/rules", { method: "PUT", cookie, body });

test("who reads and changes the rules: Operations reads, sales can't see them, only «settings: edit» changes them", async () => {
  assert.equal((await call("/leads/rules", { cookie: sales })).status, 403);
  assert.equal((await call("/leads/rules/options", { cookie: sales })).status, 403);
  const r = await call("/leads/rules", { cookie: ops });
  assert.equal(r.status, 200);
  assert.equal((await put(ops, r.body)).status, 403);
  assert.equal((await put(sales, r.body)).status, 403);
  const o = (await call("/leads/rules/options", { cookie: ops })).body;
  assert.ok(o.roles.some((x: { key: string }) => x.key === "tl"));
  assert.ok(o.people.length > 10);
  assert.ok(o.telesales.length >= 1);
});

test("the defaults are the demo's / the requirements' until someone changes them", async () => {
  await prisma.setting.deleteMany({ where: { key: "leadRules" } });
  assert.deepEqual(await rules(), JSON.parse(JSON.stringify(DEFAULT_LEAD_RULES)));
});

test("a change is saved and audited; bad combinations and unknown people are refused, in Arabic", async () => {
  const r = await rules();
  const next = { ...r, sla: { ...r.sla, warnMin: 120, pullMin: 240, warn: { to: ["tl", "owner"], ch: ["app"] } } };
  const ok = await put(admin, next);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await rules()).sla.pullMin, 240);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Setting", entityId: "leadRules" }, orderBy: { at: "desc" } });
  assert.equal(audit.module, "settings");
  assert.equal((audit.before as LeadRules).sla.pullMin, r.sla.pullMin);
  assert.equal((audit.after as LeadRules).sla.pullMin, 240);
  for (const [bad, word] of [
    [{ ...r, sla: { ...r.sla, warnMin: 300, pullMin: 200 } }, "التنبيه"],
    [{ ...r, work: { ...r.work, from: 1140, to: 660 } }, "البداية"],
    [{ ...r, work: { ...r.work, off: [0, 1, 2, 3, 4, 5, 6] } }, "يوم شغل"],
    [{ ...r, sla: { ...r.sla, pullMin: 0 } }, "أكبر من صفر"],
    [{ ...r, sla: { ...r.sla, warn: { to: ["nobody"], ch: ["app"] } } }, "مش موجود"],
    [{ ...r, noAnswer: { ...r.noAnswer, telesales: "nobody" } }, "Telesales"],
    [{ ...r, noAnswer: { ...r.noAnswer, toTelesalesAt: 1 } }, "الروتيشن"],
    [{ ...r, sla: undefined }, ""],
  ] as const) {
    const res = await put(admin, bad);
    assert.equal(res.status, 400, JSON.stringify(bad).slice(0, 80));
    assert.match(JSON.stringify(res.body), new RegExp(word));
  }
  assert.equal((await rules()).sla.pullMin, 240); // nothing refused was saved
});

/** A moment `minutes` working minutes before now, in the rules' calendar with today's holidays. */
async function workingMinutesAgo(minutes: number, r: LeadRules): Promise<Date> {
  const hs = (await call("/leads/rules/holidays", { cookie: admin })).body as { from: string; to: string }[];
  const cal = { ...calendarOf(r, PLACES_CALENDAR), holidays: holidayDays(hs) };
  const now = new Date();
  for (let t = now.getTime(); t > now.getTime() - 14 * 86_400_000; t -= 60_000) if (workingMinutesBetween(new Date(t), now, cal) >= minutes) return new Date(t);
  throw new Error("no working time in two weeks");
}

test("the leads list's SLA follows the rules: pulled after 2 hours when the pull is set to 2 hours (1.29)", async () => {
  if ((await call("/leads/summary", { cookie: admin })).body.holidayMode) return; // on an official holiday the clock is wall-clock: covered by the domain tests
  const r = { ...(await rules()), sla: { ...DEFAULT_LEAD_RULES.sla, on: true } };
  assert.equal((await put(admin, r)).status, 200);
  const made = await call("/leads", { method: "POST", cookie: admin, body: { name: `E2E-RL ${stamp}`, phones: [`0129${stamp.slice(-7)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook", assignToId: (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  leads.push(made.body.id);
  // 2h30 of working time ago: with the defaults (warn 2h30, pull 3h) it's a warning
  await prisma.lead.update({ where: { id: made.body.id }, data: { assignedAt: await workingMinutesAgo(150, r) } });
  const level = async () => (await call(`/leads?q=${made.body.code}`, { cookie: admin })).body.items[0].sla?.level as string | undefined;
  assert.equal(await level(), "warn");
  // pull after 2 hours → pulled
  assert.equal((await put(admin, { ...r, sla: { ...r.sla, warnMin: 90, pullMin: 120 } })).status, 200);
  assert.equal(await level(), "pull");
  assert.deepEqual((await call("/leads/summary", { cookie: admin })).body.slaRules, { warnAfter: 90, pullAfter: 120, holidayWarnAfter: 1320, holidayPullAfter: 1440 });
  // the SLA rule switched off: no clock
  assert.equal((await put(admin, { ...r, sla: { ...r.sla, on: false } })).status, 200);
  assert.equal(await level(), undefined);
});

test("a holiday «من … لحد …» added from the page makes today a holiday; removing it undoes that", async () => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const wasHoliday = (await call("/leads/summary", { cookie: admin })).body.holidayMode;
  assert.equal((await call("/leads/rules/holidays", { method: "POST", cookie: ops, body: { from: today, to: tomorrow, label: "E2E إجازة" } })).status, 403);
  const made = await call("/leads/rules/holidays", { method: "POST", cookie: admin, body: { from: today, to: tomorrow, label: "E2E إجازة" } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  holidays.push(made.body.id);
  assert.equal((await call("/leads/summary", { cookie: admin })).body.holidayMode, true);
  assert.ok(((await call("/leads/rules/holidays", { cookie: ops })).body as { id: string }[]).some((h) => h.id === made.body.id));
  assert.equal((await prisma.auditLog.findFirstOrThrow({ where: { entity: "Holiday", entityId: made.body.id } })).module, "settings");
  assert.equal((await call(`/leads/rules/holidays/${made.body.id}`, { method: "DELETE", cookie: admin })).status, 204);
  assert.equal((await call("/leads/summary", { cookie: admin })).body.holidayMode, wasHoliday);
});
