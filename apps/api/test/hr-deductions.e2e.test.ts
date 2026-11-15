/**
 * HR, 15 Nov · «شرايح وأنواع الخصم»: the company's deduction rules and the penalty types (whoever sees HR reads them,
 * only HR edits; validated; audited), HR's decision on someone who didn't punch («حضور» no deduction, «غياب» the
 * absence cost, «Off» none; deciding again replaces it; a real fingerprint is corrected with «تعديل» instead), the
 * «مهامي النهارده» line, and a penalty needs one of HR's types.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const START = new Date();
const P = `E2E hr-ded ${START.getTime()}`;
const DAY = "2026-10-14"; // a Wednesday, no holiday
const at = (d: string) => new Date(`${d}T00:00:00Z`);
let basant: string, admin: string, tl: string, sales: string;
let nancy: { id: string; name: string };
let saved: { rules: unknown; types: unknown };

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [basant, admin, tl, sales] = await Promise.all(["basant.elsawy@places.com", adminEmail, "mahmoud.ali@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  nancy = await prisma.employee.findFirstOrThrow({ where: { user: { email: "nancy.islam@places.com" } }, select: { id: true, name: true } });
  await prisma.attendanceDay.deleteMany({ where: { employeeId: nancy.id, day: at(DAY) } });
  const [r, t] = await Promise.all(["deductionTiers", "penaltyTypes"].map((key) => prisma.setting.findUnique({ where: { key } })));
  saved = { rules: r?.value ?? null, types: t?.value ?? null };
});
after(async () => {
  // the settings back as they were (other files read them at the same time, so the rules were never changed in a way they'd see)
  for (const [key, value] of [["deductionTiers", saved.rules], ["penaltyTypes", saved.types]] as const) {
    if (value === null) await prisma.setting.deleteMany({ where: { key } });
    else await prisma.setting.update({ where: { key }, data: { value: value as object } });
  }
  const days = await prisma.attendanceDay.findMany({ where: { employeeId: nancy.id, day: at(DAY) }, select: { id: true } });
  const pens = (await prisma.penalty.findMany({ where: { text: { startsWith: P } }, select: { id: true } })).map((p) => p.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...days.map((d) => d.id), ...pens] } }, { entity: "Setting", entityId: "deductionTiers", at: { gte: START } }] } });
  await prisma.attendanceDay.deleteMany({ where: { id: { in: days.map((d) => d.id) } } });
  await prisma.penalty.deleteMany({ where: { id: { in: pens } } });
  await prisma.$disconnect();
});

test("the rules and types: whoever sees HR reads them, only HR edits, validated and audited; sales 403", async () => {
  assert.equal((await call("/hr/settings", { cookie: sales })).status, 403);
  const s = (await call("/hr/settings", { cookie: admin })).body;
  assert.equal(s.rules.graceMinutes, 16);
  assert.ok(s.penaltyTypes.length >= 1);
  const next = { rules: { ...s.rules, absenceDays: 2 }, penaltyTypes: [...s.penaltyTypes, `${P} نوع`] };
  assert.equal((await call("/hr/settings", { method: "PUT", cookie: admin, body: next })).status, 403); // the Super Admin views HR, doesn't edit (Q49)
  assert.equal((await call("/hr/settings", { method: "PUT", cookie: tl, body: next })).status, 403);
  assert.equal((await call("/hr/settings", { method: "PUT", cookie: basant, body: { ...next, rules: { ...s.rules, graceMinutes: 20 } } })).status, 400); // the quarter (17) is inside the grace
  assert.equal((await call("/hr/settings", { method: "PUT", cookie: basant, body: { ...next, rules: { ...s.rules, absenceDays: 1.3 } } })).status, 400);
  assert.equal((await call("/hr/settings", { method: "PUT", cookie: basant, body: { ...next, penaltyTypes: ["سلوك", "سلوك"] } })).status, 400);
  const ok = await call("/hr/settings", { method: "PUT", cookie: basant, body: next });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual((await call("/hr/settings", { cookie: tl })).body, next);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Setting", entityId: "deductionTiers", action: "update", at: { gte: START } } }));
});

test("a penalty needs one of HR's types; the list shows it", async () => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const body = { employeeId: nancy.id, day: today, text: `${P} جزاء`, deductionDays: 0 };
  assert.equal((await call("/hr/penalties", { method: "POST", cookie: basant, body })).status, 400);
  assert.equal((await call("/hr/penalties", { method: "POST", cookie: basant, body: { ...body, type: `${P} مش موجود` } })).status, 400);
  const type = (await call("/hr/settings", { cookie: basant })).body.penaltyTypes[0];
  const r = await call("/hr/penalties", { method: "POST", cookie: basant, body: { ...body, type } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await call("/hr/penalties", { cookie: basant })).body.items.find((x: { id: string }) => x.id === r.body.id).type, type);
});

test("who didn't punch: HR decides absent / Off / present, deciding again replaces it; others 403", async () => {
  const decide = (cookie: string, decision: string, extra = {}) => call("/hr/attendance/decide", { method: "POST", cookie, body: { employeeId: nancy.id, day: DAY, decision, ...extra } });
  assert.equal((await decide(sales, "absent")).status, 403);
  assert.equal((await decide(admin, "absent")).status, 403);
  assert.equal((await decide(tl, "absent")).status, 403);
  const before = (await call(`/hr/attendance/day?day=${DAY}`, { cookie: basant })).body;
  assert.ok(before.missing.some((m: { employeeId: string }) => m.employeeId === nancy.id));
  const cost = (await call("/hr/settings", { cookie: basant })).body.rules.absenceDays;

  const absent = await decide(basant, "absent");
  assert.equal(absent.status, 200, JSON.stringify(absent.body));
  assert.deepEqual([absent.body.status, absent.body.decided, absent.body.deduction, absent.body.checkIn], ["absent", "absent", cost, null]);
  // read at once: attendance.e2e, running at the same time, clears AttendanceDay audit lines when it ends
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: absent.body.id, action: "decide" } }));
  const day = (await call(`/hr/attendance/day?day=${DAY}`, { cookie: basant })).body;
  assert.ok(!day.missing.some((m: { employeeId: string }) => m.employeeId === nancy.id));
  assert.ok(day.rows.some((r: { employeeId: string; status: string }) => r.employeeId === nancy.id && r.status === "absent"));

  const off = (await decide(basant, "off")).body;
  assert.deepEqual([off.status, off.deduction], ["off", 0]);
  assert.equal(await prisma.attendanceDay.count({ where: { employeeId: nancy.id, day: at(DAY) } }), 1);

  const present = (await decide(basant, "present", { checkIn: "11:40" })).body;
  assert.deepEqual([present.decided, present.checkIn, present.deduction, present.lateMinutes], ["present", "11:40", 0, 24]);
  assert.equal((await decide(basant, "present")).body.checkIn, "11:00"); // no time: the start of work

  assert.equal((await call("/hr/attendance/decide", { method: "POST", cookie: basant, body: { employeeId: nancy.id, day: "2026-10-16", decision: "off" } })).status, 400); // a Friday
  // a day with a real check-in is corrected with «تعديل», not decided
  assert.equal((await call("/hr/attendance", { method: "PUT", cookie: basant, body: { employeeId: nancy.id, day: DAY, checkIn: "11:05" } })).status, 200);
  assert.equal((await decide(basant, "absent")).status, 400);
});

test("«مهامي النهارده»: after the start of work HR sees who hasn't punched", async () => {
  const lines = (await call("/home/hr", { cookie: basant })).body as { kind: string; values: { n: number; names: string } }[];
  const line = lines.find((l) => l.kind === "noPunch");
  const now = new Date(), clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).format(now);
  if (clock.startsWith("Fri") || clock.slice(-5) < "11:00") assert.equal(line, undefined);
  else {
    assert.ok(line, "a working day after 11:00 with nobody punched in the test database");
    assert.ok(line.values.n > 0 && line.values.names.length > 0);
  }
  assert.ok(!(await call("/home/hr", { cookie: tl })).body.some((l: { kind: string }) => l.kind === "noPunch")); // a TL doesn't decide
});
