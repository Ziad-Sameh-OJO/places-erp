/**
 * 7.2 · 7.10 · 7.12 · attendance (M-05 2.3, 3.1, 3.2): HR uploads the fingerprint sheet (Excel / CSV from the device);
 * known names are written through the tiers (11:18 → a quarter day and 2 minutes of Weekly Delay, 12:10 → a day);
 * uploading it again never duplicates a day; a name nobody knows waits for HR, who links it once (and the next sheet
 * matches it by itself); HR fills a day the device missed. Sales get 403, a TL sees only his team.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const START = new Date();
const P = `E2E${START.getTime()}`;
const DAY = "2026-10-20"; // a Tuesday, no holiday
let basant: string, sales: string, tl: string;
let nancy: { id: string; name: string }, hr: { id: string; name: string }, mokhtar: { id: string; name: string };

const csv = (rows: string[][]) => new Blob([["الاسم,التاريخ,الدخول,الخروج", ...rows.map((r) => r.join(","))].join("\n")]);
const upload = (path: string, file: Blob, cookie: string) => {
  const form = new FormData();
  form.append("file", file, "fingerprint.csv");
  return fetch(`${API}${path}`, { method: "POST", body: form, headers: { cookie } });
};

before(async () => {
  [basant, sales, tl] = await Promise.all(["basant.elsawy@places.com", "m.mohsen@places.com", "mahmoud.ali@places.com"].map((e) => session(e)));
  const emp = (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } }, select: { id: true, name: true } });
  [nancy, hr, mokhtar] = await Promise.all([emp("nancy.islam@places.com"), emp("basant.elsawy@places.com"), emp("mokhtar.gamal@places.com")]);
  await prisma.attendanceDay.deleteMany({ where: { employeeId: { in: [nancy.id, hr.id, mokhtar.id] }, day: new Date(`${DAY}T00:00:00Z`) } });
});
after(async () => {
  const days = await prisma.attendanceDay.findMany({ where: { employeeId: { in: [nancy.id, hr.id, mokhtar.id] }, day: new Date(`${DAY}T00:00:00Z`) }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: days.map((d) => d.id) } }, { entity: { in: ["AttendanceDay", "FingerprintAlias"] }, at: { gte: START } }] } });
  await prisma.attendanceDay.deleteMany({ where: { id: { in: days.map((d) => d.id) } } });
  await prisma.fingerprintUnmatched.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.fingerprintAlias.deleteMany({ where: { name: { startsWith: P.toLowerCase() } } });
  await prisma.$disconnect();
});

test("only HR imports; sales 403 on attendance", async () => {
  assert.equal((await call("/hr/attendance/day", { cookie: sales })).status, 403);
  assert.equal((await upload("/hr/attendance/import", csv([[nancy.name, DAY, "11:18", "19:00"]]), tl)).status, 403);
});

test("the sheet: tiers per person, never twice, unknown names wait (7.2 · 7.12)", async () => {
  const sheet = csv([[` ${nancy.name} `, DAY, "11:18", "19:00"], [hr.name, DAY, "12:10", "19:05"], [`${P} مجهول`, DAY, "11:00", "19:00"]]);
  const pre = await (await upload("/hr/attendance/import/preview", sheet, basant)).json();
  assert.equal(pre.valid, 3);
  const r = await (await upload("/hr/attendance/import", sheet, basant)).json();
  assert.deepEqual(r, { imported: 2, skipped: 0, unmatched: 1 });
  const day = (await call(`/hr/attendance/day?day=${DAY}`, { cookie: basant })).body;
  const n = day.rows.find((x: { employeeId: string }) => x.employeeId === nancy.id), b = day.rows.find((x: { employeeId: string }) => x.employeeId === hr.id);
  assert.deepEqual([n.checkIn, n.lateMinutes, n.deduction], ["11:18", 2, 0.25]);
  assert.deepEqual([b.checkIn, b.deduction], ["12:10", 1]);
  assert.equal(day.working, true);
  assert.ok(day.unmatched.some((u: { name: string }) => u.name === `${P} مجهول`));
  // uploaded again: nothing duplicated
  assert.deepEqual(await (await upload("/hr/attendance/import", sheet, basant)).json(), { imported: 0, skipped: 2, unmatched: 1 });
  assert.equal(await prisma.attendanceDay.count({ where: { employeeId: nancy.id, day: new Date(`${DAY}T00:00:00Z`) } }), 1);
  // a broken time is an error by line, nothing saved
  const bad = await (await upload("/hr/attendance/import/preview", csv([[nancy.name, DAY, "late", ""]]), basant)).json();
  assert.equal(bad.errors[0].line, 2);
});

test("HR links an unknown name once; that day is written; HR fills a missing day; Weekly Delay and history (7.10)", async () => {
  const day = (await call(`/hr/attendance/day?day=${DAY}`, { cookie: basant })).body;
  const u = day.unmatched.find((x: { name: string }) => x.name === `${P} مجهول`);
  assert.equal((await call(`/hr/attendance/unmatched/${u.id}/link`, { method: "POST", cookie: tl, body: { employeeId: mokhtar.id } })).status, 403);
  const l = await call(`/hr/attendance/unmatched/${u.id}/link`, { method: "POST", cookie: basant, body: { employeeId: mokhtar.id } });
  assert.equal(l.status, 201, JSON.stringify(l.body));
  assert.ok(await prisma.attendanceDay.findFirst({ where: { employeeId: mokhtar.id, day: new Date(`${DAY}T00:00:00Z`) } }));
  // HR corrects Nancy's day (the device read it wrong): audited old → new
  const fix = await call("/hr/attendance", { method: "PUT", cookie: basant, body: { employeeId: nancy.id, day: DAY, checkIn: "11:05" } });
  assert.equal(fix.status, 200, JSON.stringify(fix.body));
  assert.equal(fix.body.deduction, 0);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "AttendanceDay", action: "update", at: { gte: START } } }));
  const wd = (await call(`/hr/attendance/weekly-delay?from=${DAY}&to=${DAY}`, { cookie: basant })).body;
  assert.equal(wd.people.find((p: { employeeId: string }) => p.employeeId === hr.id).total, 54); // 12:10 − 11:16
  const h = (await call(`/hr/attendance/history?from=2026-10-01&to=2026-10-31&employeeId=${hr.id}`, { cookie: basant })).body;
  assert.equal(h.totals.deductionDays, 1);
  // a TL doesn't see someone outside his team
  assert.equal((await call(`/hr/attendance/history?from=2026-10-01&to=2026-10-31&employeeId=${hr.id}`, { cookie: tl })).status, 404);
});
