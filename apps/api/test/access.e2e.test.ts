/**
 * Phase 1 end-to-end (M-09 · M-13 · M-14) against the real API and database.
 * Nancy (Office Manager) manages accounts; Ahmed Islam (Super Admin) edits settings; Mohsen is a salesperson.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import ExcelJS from "exceljs";
import { API, PW, call, lastMail, login, session, tokenIn } from "./helpers.ts";

const NEW_PW = "NewPass12345x";
const stamp = Date.now();
const email = `e2e-${stamp}@places.test`;
let nancy: string, admin: string, sales: string, newId: string, tlEmployeeId: string;

before(async () => {
  [nancy, admin, sales] = await Promise.all([session("nancy.islam@places.com"), session("ahmed.islam@places.com"), session("m.mohsen@places.com")]);
  tlEmployeeId = (await prisma.employee.findFirstOrThrow({ where: { name: "محمود علي" } })).id;
});

after(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: "@places.test" } }, select: { id: true } });
  await prisma.employee.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.role.deleteMany({ where: { key: { startsWith: "custom-" }, label: { startsWith: "E2E" } } });
  await prisma.holiday.deleteMany({ where: { label: { startsWith: "E2E" } } });
  await prisma.$disconnect();
});

const input = (over: Record<string, unknown> = {}) => ({
  name: "تجربة E2E", email, department: "المبيعات", role: "sales", extraRoles: [], teamLeaderId: tlEmployeeId, ...over,
});

test("a salesperson can't open user management", async () => {
  assert.equal((await call("/access/users", { cookie: sales })).status, 403);
});

test("new account: created INVITED, gets the activation email, sets a password, signs in", async () => {
  const since = Date.now();
  const r = await call("/access/users", { method: "POST", cookie: nancy, body: input() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  newId = r.body.id;
  assert.equal(r.body.status, "INVITED");
  assert.equal((await login(email)).status, 401); // no password yet
  const mail = lastMail(email, since);
  assert.match(mail.subject, /فعّل حسابك/);
  assert.equal((await call("/auth/activate", { method: "POST", body: { token: tokenIn(mail.text), password: "short1" } })).status, 400);
  assert.equal((await call("/auth/activate", { method: "POST", body: { token: tokenIn(mail.text), password: NEW_PW } })).status, 204);
  assert.equal((await call("/auth/activate", { method: "POST", body: { token: tokenIn(mail.text), password: NEW_PW } })).status, 400); // once
  const me = await call("/auth/me", { cookie: await session(email, NEW_PW) });
  assert.equal(me.body.name, "تجربة E2E");
  assert.deepEqual(me.body.roles, ["sales"]);
  const emp = await prisma.employee.findUniqueOrThrow({ where: { userId: newId } });
  assert.equal(emp.teamLeaderId, tlEmployeeId);
});

test("search users by mobile and department (M-09 5.2); sales can't list departments", async () => {
  const dept = `E2E قسم ${stamp}`;
  assert.equal((await call(`/access/users/${newId}`, { method: "PUT", cookie: nancy, body: input({ department: dept, phone: "01000001234" }) })).status, 200);
  const ids = async (qs: string) => (await call(`/access/users?${qs}`, { cookie: nancy })).body.items.map((u: { id: string }) => u.id);
  assert.deepEqual(await ids(`q=${encodeURIComponent("0100 000 1234")}`), [newId]); // typed with spaces
  assert.deepEqual(await ids("q=01000001234"), [newId]);
  assert.deepEqual(await ids(`department=${encodeURIComponent(dept)}`), [newId]);
  assert.deepEqual(await ids(`q=${encodeURIComponent(dept)}`), [newId]);
  assert.deepEqual(await ids(`department=${encodeURIComponent(dept)}&status=DISABLED`), []);
  const depts = await call("/access/users/departments", { cookie: nancy });
  assert.ok(depts.body.includes(dept) && depts.body.includes("المبيعات"));
  assert.equal((await call("/access/users/departments", { cookie: sales })).status, 403);
  assert.equal((await call("/access/users?department=x", { cookie: sales })).status, 403);
  await call(`/access/users/${newId}`, { method: "PUT", cookie: nancy, body: input() }); // back as it was
});

test("the same email can't get two accounts", async () => {
  assert.equal((await call("/access/users", { method: "POST", cookie: nancy, body: input({ name: "تاني" }) })).status, 409);
});

test("only a Super Admin can give the Super Admin role", async () => {
  assert.equal((await call(`/access/users/${newId}`, { method: "PUT", cookie: nancy, body: input({ extraRoles: ["admin"] }) })).status, 403);
});

test("changing someone's roles applies at once and notifies them", async () => {
  const r = await call(`/access/users/${newId}`, { method: "PUT", cookie: nancy, body: input({ extraRoles: ["telesales"] }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const cookie = await session(email, NEW_PW);
  assert.deepEqual((await call("/auth/me", { cookie })).body.permissions.leads, ["view", "create", "edit", "import"]);
  const n = await call("/notifications", { cookie });
  assert.equal(n.body.unread, 1);
  assert.match(n.body.items[0].text, /أدوارك اتغيرت/);
  assert.equal((await call(`/notifications/${n.body.items[0].id}/read`, { method: "POST", cookie })).status, 204);
  assert.equal((await call("/notifications", { cookie })).body.unread, 0);
});

test("per-person exception: open finance for one person, then drop it", async () => {
  let r = await call(`/access/users/${newId}/permissions`, { method: "PATCH", cookie: nancy, body: { finance: ["view", "export"] } });
  assert.deepEqual(r.body.effective.finance, ["view", "export"]);
  const cookie = await session(email, NEW_PW);
  assert.deepEqual((await call("/auth/me", { cookie })).body.permissions.finance, ["view", "export"]);
  r = await call(`/access/users/${newId}/permissions`, { method: "PATCH", cookie: nancy, body: { finance: null } });
  assert.deepEqual(r.body.effective.finance, []);
});

test("nobody can take away their own right to manage permissions", async () => {
  const me = (await call("/auth/me", { cookie: nancy })).body;
  const r = await call(`/access/users/${me.id}/permissions`, { method: "PATCH", cookie: nancy, body: { access: ["view"] } });
  assert.equal(r.status, 403);
  assert.ok((await call("/auth/me", { cookie: nancy })).body.permissions.access.includes("edit")); // rolled back
});

test("disabling signs the person out everywhere; enabling brings them back", async () => {
  const cookie = await session(email, NEW_PW);
  assert.equal((await call(`/access/users/${newId}/disable`, { method: "POST", cookie: nancy })).status, 204);
  assert.equal((await call("/auth/me", { cookie })).status, 401);
  assert.equal((await login(email, NEW_PW)).status, 401);
  assert.equal((await call(`/access/users/${newId}/enable`, { method: "POST", cookie: nancy })).status, 204);
  assert.equal((await login(email, NEW_PW)).status, 200);
});

test("locked after 5 wrong passwords → the admin unlocks", async () => {
  for (let i = 0; i < 5; i++) await login(email, "wrong-password-1");
  assert.equal((await login(email, NEW_PW)).status, 401);
  assert.equal((await call(`/access/users/${newId}/unlock`, { method: "POST", cookie: nancy })).status, 204);
  assert.equal((await login(email, NEW_PW)).status, 200);
});

test("forgot password: same answer for any email, the link works once, old sessions end", async () => {
  const old = await session(email, NEW_PW);
  const since = Date.now();
  assert.equal((await call("/auth/forgot", { method: "POST", body: { email: "nobody@places.test" } })).status, 204);
  assert.equal((await call("/auth/forgot", { method: "POST", body: { email } })).status, 204);
  const token = tokenIn(lastMail(email, since).text);
  assert.equal((await call("/auth/reset", { method: "POST", body: { token, password: "Another12345" } })).status, 204);
  assert.equal((await call("/auth/me", { cookie: old })).status, 401);
  assert.equal((await login(email, "Another12345")).status, 200);
});

test("OTP on for one person: no session until the emailed code", async () => {
  await call(`/access/users/${newId}`, { method: "PUT", cookie: nancy, body: input({ otpRequired: true }) });
  const since = Date.now();
  const r = await login(email, "Another12345");
  assert.deepEqual([r.status, r.body.otpRequired, r.cookie], [200, true, undefined]);
  const code = lastMail(email, since).subject.match(/\d{6}/)![0];
  assert.equal((await call("/auth/otp", { method: "POST", body: { email, code: code === "000000" ? "111111" : "000000" } })).status, 401);
  const ok = await call("/auth/otp", { method: "POST", body: { email, code } });
  assert.equal(ok.status, 200);
  assert.equal((await call("/auth/me", { cookie: ok.cookie })).status, 200);
});

test("OTP «ابعت تاني» (M-09 2.4): refused before a minute, then a new code that replaces the old one", async () => {
  const resend = (e = email) => call("/auth/otp/resend", { method: "POST", body: { email: e } });
  // no sign-in waiting for a code (the last one was used), unknown email, someone without OTP: same answer
  assert.equal((await resend()).status, 400);
  assert.equal((await resend(`nobody-${stamp}@places.test`)).status, 400);
  assert.equal((await resend("m.mohsen@places.com")).status, 400);
  const since = Date.now();
  await login(email, "Another12345");
  const first = lastMail(email, since).subject.match(/\d{6}/)![0];
  const early = await resend();
  assert.equal(early.status, 429);
  assert.match(early.body.error, /بعد \d+ ثانية/);
  // a minute later (moved back in the database instead of waiting)
  await prisma.authToken.updateMany({ where: { userId: newId, kind: "OTP" }, data: { createdAt: new Date(Date.now() - 61_000) } });
  const again = Date.now();
  assert.equal((await resend()).status, 204);
  const second = lastMail(email, again).subject.match(/\d{6}/)![0];
  assert.equal((await resend()).status, 429); // the minute starts over
  if (first !== second) assert.equal((await call("/auth/otp", { method: "POST", body: { email, code: first } })).status, 401);
  assert.equal((await call("/auth/otp", { method: "POST", body: { email, code: second } })).status, 200);
});

test("roles: copy, edit the matrix, built-in and in-use roles can't be deleted", async () => {
  const r = await call("/access/roles", { method: "POST", cookie: nancy, body: { label: "E2E Sales Plus", tier: "Executive Staff", scope: "own", copyFrom: "sales" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const key = r.body.key;
  assert.equal((await call(`/access/roles/${key}/permissions`, { method: "PATCH", cookie: nancy, body: { reports: ["export"] } })).status, 204);
  const role = (await call("/access/roles", { cookie: nancy })).body.find((x: { key: string }) => x.key === key);
  assert.deepEqual(role.permissions.reports, ["view", "export"]);
  assert.deepEqual(role.permissions.leads, ["view", "create", "edit"]); // copied from Sales
  assert.equal((await call("/access/roles/sales", { method: "DELETE", cookie: nancy })).status, 400);
  await call(`/access/users/${newId}`, { method: "PUT", cookie: nancy, body: input({ role: key }) });
  assert.equal((await call(`/access/roles/${key}`, { method: "DELETE", cookie: nancy })).status, 400);
  await call(`/access/users/${newId}`, { method: "PUT", cookie: nancy, body: input() });
  assert.equal((await call(`/access/roles/${key}`, { method: "DELETE", cookie: nancy })).status, 204);
});

test("every change is in the audit log", async () => {
  const r = await call(`/access/audit?entityId=${newId}`, { cookie: nancy });
  const actions = r.body.items.map((x: { action: string }) => x.action);
  for (const a of ["create", "activated", "update", "disable", "enable", "locked", "unlock", "password-reset"]) assert.ok(actions.includes(a), a);
});

test("settings: everyone reads the lists, only master:edit changes them, bad values are refused", async () => {
  const s = await call("/settings", { cookie: sales });
  assert.equal(s.status, 200);
  assert.ok(s.body.areas.includes("الشيخ زايد"));
  assert.equal((await call("/settings/areas", { method: "PUT", cookie: sales, body: { value: [...s.body.areas, "x"] } })).status, 403);
  const areas = [...s.body.areas, "E2E Area"];
  assert.equal((await call("/settings/areas", { method: "PUT", cookie: admin, body: { value: areas } })).status, 200);
  assert.ok((await call("/settings", { cookie: sales })).body.areas.includes("E2E Area"));
  await call("/settings/areas", { method: "PUT", cookie: admin, body: { value: s.body.areas } });
  const bad = { warnAfter: 200, pullAfter: 180, holidayWarnAfter: 1320, holidayPullAfter: 1440 };
  assert.equal((await call("/settings/slaRules", { method: "PUT", cookie: admin, body: { value: bad } })).status, 400);
  assert.equal((await call("/settings/nonsense", { method: "PUT", cookie: admin, body: { value: 1 } })).status, 400);
});

test("holidays: add and remove, both audited", async () => {
  assert.equal((await call("/settings/holidays", { method: "POST", cookie: admin, body: { day: "2027-01-07", label: "E2E holiday" } })).status, 204);
  assert.ok((await call("/settings/holidays", { cookie: sales })).body.some((h: { label: string }) => h.label === "E2E holiday"));
  assert.equal((await call("/settings/holidays/2027-01-07", { method: "DELETE", cookie: admin })).status, 204);
});

test("notification rules: the admin turns email off for an event; my own email preference", async () => {
  const rules = (await call("/notifications/rules", { cookie: admin })).body;
  assert.ok(rules.some((r: { key: string }) => r.key === "lead.pulled"));
  assert.equal((await call("/notifications/rules/hr.excuse", { method: "PUT", cookie: sales, body: { channels: ["app"] } })).status, 403);
  assert.equal((await call("/notifications/rules/procurement.request", { method: "PUT", cookie: admin, body: { channels: ["app", "push"] } })).status, 200);
  await call("/notifications/rules/procurement.request", { method: "PUT", cookie: admin, body: { channels: ["app", "push", "email"] } });
  assert.equal((await call("/notifications/preferences", { method: "PUT", cookie: sales, body: { emailNotifications: false } })).status, 204);
  await call("/notifications/preferences", { method: "PUT", cookie: sales, body: { emailNotifications: true } });
});

test("change my password: the old one stops working", async () => {
  const cookie = await session("m.eid@places.com");
  assert.equal((await call("/auth/password", { method: "POST", cookie, body: { current: "wrong", next: "Changed12345" } })).status, 400);
  assert.equal((await call("/auth/password", { method: "POST", cookie, body: { current: PW, next: "Changed12345" } })).status, 204);
  assert.equal((await login("m.eid@places.com")).status, 401);
  await call("/auth/password", { method: "POST", cookie, body: { current: "Changed12345", next: PW } }); // put it back
});

test("Excel export: the filtered users as .xlsx for whoever has «export»; others get 403; it's audited", async () => {
  const res = await fetch(`${API}/access/users/export?status=ACTIVE`, { headers: { cookie: nancy } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /spreadsheetml/);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
  const sheet = book.worksheets[0]!;
  assert.equal(sheet.views[0]?.rightToLeft, true);
  assert.equal(sheet.getRow(1).getCell(1).value, "الاسم");
  const active = (await call("/access/users?status=ACTIVE&pageSize=100", { cookie: nancy })).body.total;
  assert.equal(sheet.rowCount - 1, active);
  assert.equal((await fetch(`${API}/access/users/export`, { headers: { cookie: sales } })).status, 403);
  const log = await call("/access/audit?entityId=export", { cookie: nancy });
  assert.equal(log.body.items[0].action, "export");
});

/** An .xlsx in memory with these rows under the holidays template headers. */
async function holidaySheet(rows: unknown[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Sheet1");
  sheet.addRow(["الإجازة", "ملاحظة", "التاريخ"]); // any column order, extra columns ignored
  for (const r of rows) sheet.addRow(r);
  return new Blob([await book.xlsx.writeBuffer()]);
}
const upload = (path: string, file: Blob, cookie: string, name = "holidays.xlsx") => {
  const form = new FormData();
  form.append("file", file, name);
  return fetch(`${API}${path}`, { method: "POST", body: form, headers: { cookie } });
};

test("Excel import: preview shows errors by line and saves nothing; a clean sheet saves after confirm; audited; sales gets 403", async () => {
  const tpl = await fetch(`${API}/settings/holidays/import/template`, { headers: { cookie: admin } });
  assert.equal(tpl.status, 200);
  const bad = await holidaySheet([
    ["E2E عيد", "", new Date(Date.UTC(2091, 3, 10))],   // a real Excel date cell
    ["E2E غلط", "", "2091-02-30"],
    ["", "", ""],                                       // blank line: skipped
    ["E2E مكرر", "", "2091-04-10"],
    ["x", "", "2091-05-01"],
  ]);
  const p = await (await upload("/settings/holidays/import/preview", bad, admin)).json();
  assert.equal(p.total, 4);
  assert.equal(p.valid, 1);
  assert.deepEqual(p.errors.map((e: { line: number }) => e.line), [3, 5, 6]);
  assert.equal(p.errors[0].column, "التاريخ");
  assert.equal(p.sample[0].day, "2091-04-10");
  assert.equal((await upload("/settings/holidays/import", bad, admin)).status, 400);
  assert.equal(await prisma.holiday.count({ where: { label: { startsWith: "E2E" } } }), 0);

  const csv = new Blob(["التاريخ,الإجازة\n2091-04-10,E2E عيد\n2091-07-23,E2E ثورة\n"]);
  assert.equal((await upload("/settings/holidays/import", csv, sales, "h.csv")).status, 403);
  const done = await upload("/settings/holidays/import", csv, admin, "h.csv");
  assert.deepEqual(await done.json(), { imported: 2 });
  const saved = await prisma.holiday.findMany({ where: { label: { startsWith: "E2E" } }, orderBy: { day: "asc" } });
  assert.deepEqual(saved.map((h) => h.day.toISOString().slice(0, 10)), ["2091-04-10", "2091-07-23"]); // no timezone shift
  const log = await call("/access/audit?entityId=import", { cookie: nancy });
  assert.equal(log.body.items[0].action, "import");
  assert.deepEqual(log.body.items[0].after, { rows: 2 });

  const missing = await (await upload("/settings/holidays/import/preview", new Blob(["day,label\n"]), admin, "h.csv")).json();
  assert.match(missing.errors[0].message, /أعمدة ناقصة/);
});
