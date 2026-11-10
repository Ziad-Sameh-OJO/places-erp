/**
 * Phase 1 end-to-end (M-09 · M-13 · M-14) against the real API and database.
 * Nancy (Office Manager) manages accounts; Ahmed Islam (Super Admin) edits settings; Mohsen is a salesperson.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import ExcelJS from "exceljs";
import { hash } from "@node-rs/argon2";
import { API, PW, call, lastMail, login, mark, session, tokenIn } from "./helpers.ts";

const NEW_PW = "NewPass12345x";
const stamp = Date.now();
const email = `e2e-${stamp}@places.test`;
let nancy: string, admin: string, sales: string, newId: string, tlEmployeeId: string;

before(async () => {
  [nancy, admin, sales] = await Promise.all([session("nancy.islam@places.com"), session("ahmed.islam@places.com"), session("m.mohsen@places.com")]);
  tlEmployeeId = (await prisma.employee.findFirstOrThrow({ where: { name: "محمود علي" } })).id;
});

// what was said about this file's accounts and role (to the admins too), and the mails to its addresses
mark(String(stamp), "تجربة E2E", "E2E Sales Plus");
after(async () => {
  // only this file's accounts: other files make @places.test people too and may still be running
  const users = (await prisma.user.findMany({ where: { email: { endsWith: `${stamp}@places.test` } }, select: { id: true } })).map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.employee.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.role.deleteMany({ where: { key: { startsWith: "custom-" }, label: { startsWith: "E2E" } } });
  await prisma.holiday.deleteMany({ where: { label: { startsWith: "E2E-ACC" } } }) // its own prefix: lead-rules adds «E2E إجازة» at the same time;
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

test("a Super Admin's account is changed by a Super Admin only: «access: edit» can't take it over (M-09)", async () => {
  const [ahmed, safwat] = await Promise.all(["ahmed.islam@places.com", "m.safwat@places.com"].map(async (e) => (await prisma.user.findUniqueOrThrow({ where: { email: e } })).id));
  const by = (cookie: string, path: string, method = "POST", body?: unknown) => call(`/access/users/${ahmed}${path}`, { method, cookie, ...(body ? { body } : {}) });
  // Nancy (access: edit / create, not a Super Admin): his email + OTP, stopping him, unlock, reset, invite, exceptions
  assert.equal((await by(nancy, "", "PUT", input({ email: `takeover-${stamp}@places.test`, otpRequired: false }))).status, 403);
  for (const p of ["/disable", "/enable", "/unlock", "/reset", "/invite"]) assert.equal((await by(nancy, p)).status, 403, p);
  assert.equal((await by(nancy, "/permissions", "PATCH", { finance: ["view"] })).status, 403);
  assert.equal((await call(`/access/users/${ahmed}/permissions`, { cookie: nancy })).body.editable, false);
  const still = await prisma.user.findUniqueOrThrow({ where: { id: ahmed } });
  assert.deepEqual([still.email, still.status], ["ahmed.islam@places.com", "ACTIVE"]);
  // another Super Admin gets past the guard (the account just isn't locked)
  const r = await call(`/access/users/${safwat}/unlock`, { method: "POST", cookie: admin });
  assert.deepEqual([r.status, r.body.error], [400, "الحساب مش مقفول"]);
});

test("changing someone's roles applies at once and notifies them", async () => {
  const r = await call(`/access/users/${newId}`, { method: "PUT", cookie: nancy, body: input({ extraRoles: ["telesales"] }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const cookie = await session(email, NEW_PW);
  assert.deepEqual((await call("/auth/me", { cookie })).body.permissions.leads, ["view", "create", "edit", "import"]);
  // only this one: a Broadcast sent by another file at the same time reaches every salesperson, this one too
  const n = await call("/notifications", { cookie });
  const roles = (n.body.items as { id: string; text: string }[]).filter((x) => /أدوارك اتغيرت/.test(x.text));
  assert.equal(roles.length, 1);
  assert.equal((await call(`/notifications/${roles[0]!.id}/read`, { method: "POST", cookie })).status, 204);
  assert.ok((await prisma.notification.findUniqueOrThrow({ where: { id: roles[0]!.id } })).readAt);
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

test("a reset link sent before the account was stopped can't bring it back", async () => {
  const since = Date.now();
  assert.equal((await call("/auth/forgot", { method: "POST", body: { email } })).status, 204);
  const token = tokenIn(lastMail(email, since).text);
  assert.equal((await call(`/access/users/${newId}/disable`, { method: "POST", cookie: nancy })).status, 204);
  assert.equal((await call("/auth/reset", { method: "POST", body: { token, password: "Sneaky123456" } })).status, 400);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: newId } })).status, "DISABLED");
  assert.equal((await call(`/access/users/${newId}/enable`, { method: "POST", cookie: nancy })).status, 204);
  assert.equal((await login(email, NEW_PW)).status, 200); // the old password still stands
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
  const r = await call(`/access/audit?entityId=${newId}&pageSize=100`, { cookie: nancy });
  const actions = r.body.items.map((x: { action: string }) => x.action);
  for (const a of ["create", "activated", "update", "disable", "enable", "locked", "unlock", "password-reset"]) assert.ok(actions.includes(a), a);
});

test("settings: everyone reads the lists, only master:edit changes them, bad values are refused", async () => {
  const s = await call("/settings", { cookie: sales });
  assert.equal(s.status, 200);
  const values = (list: { value: string }[]) => list.map((i) => i.value);
  assert.ok(values(s.body.areas).includes("الشيخ زايد"));
  const saved = await prisma.setting.findUnique({ where: { key: "areas" } });
  try {
    assert.equal((await call("/settings/areas", { method: "PUT", cookie: sales, body: { value: [...s.body.areas, { value: "x", active: true }] } })).status, 403);
    const areas = [...s.body.areas, { value: "E2E Area", active: true }];
    assert.equal((await call("/settings/areas", { method: "PUT", cookie: admin, body: { value: areas } })).status, 200);
    assert.ok(values((await call("/settings", { cookie: sales })).body.areas).includes("E2E Area"));
  } finally {
    // a value is never removed through the API (12.7): the test puts the list back directly
    if (saved) await prisma.setting.update({ where: { key: "areas" }, data: { value: saved.value as never } });
  }
  // the SLA times moved to «قواعد الليدز» (1.29): «slaRules» isn't a setting any more
  assert.equal((await call("/settings/slaRules", { method: "PUT", cookie: admin, body: { value: { warnAfter: 100, pullAfter: 200 } } })).status, 400);
  assert.equal((await call("/settings/nonsense", { method: "PUT", cookie: admin, body: { value: 1 } })).status, 400);
});

test("who changes which list (#186): its own roles / people, add apart from switch off; set up by «access: edit» only", async () => {
  const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: "ahmed.islam@places.com" } })).id;
  const savedList = await prisma.setting.findUnique({ where: { key: "mkTaskTypes" } });
  const put = (key: string, cookie: string, value: unknown) => call(`/settings/${key}`, { method: "PUT", cookie, body: { value } });
  const list = async () => (await call("/settings", { cookie: sales })).body.mkTaskTypes as { value: string; active: boolean }[];
  try {
    const editors = { mkTaskTypes: { add: ["sales"], off: [adminId] } };
    assert.equal((await put("listEditors", sales, editors)).status, 403);
    assert.equal((await put("listEditors", nancy, { mkTaskTypes: { add: ["no-such-role"], off: [] } })).status, 400);
    assert.equal((await put("listEditors", nancy, editors)).status, 200);
    assert.ok(await prisma.auditLog.findFirst({ where: { module: "access", entity: "Setting", entityId: "listEditors" } }));
    assert.deepEqual((await call("/settings", { cookie: sales })).body.listEditors, editors);

    // the sales role adds without «master: edit», but may not switch off
    const added = [...(await list()), { value: "E2E تاسك", active: true }];
    assert.equal((await put("mkTaskTypes", sales, added)).status, 200);
    const off = added.map((i) => (i.value === "E2E تاسك" ? { ...i, active: false } : i));
    const refused = await put("mkTaskTypes", sales, off);
    assert.equal(refused.status, 403);
    assert.match(refused.body.error, /توقّف أو ترجّع.*أنواع تاسكات التسويق/);
    // «master: edit» is not enough once the list is set up; the admin is named for switching off only
    assert.equal((await put("mkTaskTypes", nancy, [...added, { value: "E2E تاني", active: true }])).status, 403);
    assert.equal((await put("mkTaskTypes", admin, off)).status, 200);
    assert.equal((await list()).find((i) => i.value === "E2E تاسك")?.active, false);
    assert.equal((await put("mkTaskTypes", admin, [...off, { value: "E2E تاني", active: true }])).status, 403);
    // a list nobody set up stays with «master: edit»
    assert.equal((await put("ticketDepts", sales, [...(await call("/settings", { cookie: sales })).body.ticketDepts, { value: "E2E قسم", active: true }])).status, 403);
    assert.equal((await call("/settings/list-editors/options", { cookie: sales })).status, 403);
    const o = (await call("/settings/list-editors/options", { cookie: nancy })).body;
    assert.ok(o.roles.some((r: { key: string }) => r.key === "sales") && o.people.some((p: { id: string }) => p.id === adminId));
  } finally {
    await prisma.setting.deleteMany({ where: { key: "listEditors" } });
    if (savedList) await prisma.setting.update({ where: { key: "mkTaskTypes" }, data: { value: savedList.value as never } });
    else await prisma.setting.deleteMany({ where: { key: "mkTaskTypes" } });
  }
});

test("each department's settings for its manager only, the money rules for the Super Admin only (12.8 · M-13 4.1 · 2.2)", async () => {
  const [hr, marketing, manar] = await Promise.all([session("basant.elsawy@places.com"), session("rahma.hassan@places.com"), session("manar.ahmed@places.com")]);
  const s = (await call("/settings", { cookie: sales })).body;
  // saving today's value back: the permission is what's tested, nothing other tests read changes
  const put = (key: string, cookie: string, value: unknown = s[key]) => call(`/settings/${key}`, { method: "PUT", cookie, body: { value } });
  assert.equal((await put("leaveTypes", hr)).status, 200);
  assert.equal((await put("whatsappDailyLimit", marketing)).status, 200);
  assert.equal((await put("leaveTypes", marketing)).status, 403); // another department's
  assert.equal((await put("whatsappDailyLimit", hr)).status, 403);
  assert.equal((await put("leaveTypes", nancy)).status, 403); // «master: edit» alone isn't the HR
  assert.equal((await put("whatsappDailyLimit", manar)).status, 403);
  // the money rule and the sending address: the Super Admin only
  const money = await put("procurementBigApprovers", nancy);
  assert.equal(money.status, 403);
  assert.match(money.body.error, /Super Admin بس/);
  assert.equal((await put("notificationsFrom", hr)).status, 403);
  assert.equal((await put("procurementBigApprovers", admin)).status, 200);
  assert.equal((await put("leaveTypes", admin)).status, 200);
  // the channels list (not set up in «مين يعدّل»): the marketing, not the HR
  assert.equal((await put("channels", hr)).status, 403);
  assert.equal((await put("channels", marketing)).status, 200);
  // the calendar from «الإعدادات» is the HR's: the marketing manager can't add a holiday there
  assert.equal((await call("/settings/holidays", { method: "POST", cookie: marketing, body: { from: "2027-04-01", to: "2027-04-01", label: "E2E-ACC x" } })).status, 403);
  const h = await call("/settings/holidays", { method: "POST", cookie: hr, body: { from: "2027-04-01", to: "2027-04-01", label: "E2E-ACC شم النسيم" } });
  assert.equal(h.status, 201);
  assert.equal((await call(`/settings/holidays/${h.body.id}`, { method: "DELETE", cookie: marketing })).status, 403);
  assert.equal((await call(`/settings/holidays/${h.body.id}`, { method: "DELETE", cookie: hr })).status, 204);
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "master", entity: "Setting", entityId: "whatsappDailyLimit" } }));
});

test("holidays «من … لحد …» (1.29): add and remove, both audited; a backwards range is refused", async () => {
  const made = await call("/settings/holidays", { method: "POST", cookie: admin, body: { from: "2027-03-09", to: "2027-03-12", label: "E2E-ACC عيد" } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual({ ...made.body, id: undefined }, { id: undefined, from: "2027-03-09", to: "2027-03-12", label: "E2E-ACC عيد" });
  assert.ok((await call("/settings/holidays", { cookie: sales })).body.some((h: { id: string }) => h.id === made.body.id));
  assert.equal((await call("/settings/holidays", { method: "POST", cookie: sales, body: { from: "2027-03-09", to: "2027-03-09", label: "E2E-ACC x" } })).status, 403);
  const back = await call("/settings/holidays", { method: "POST", cookie: admin, body: { from: "2027-03-12", to: "2027-03-09", label: "E2E-ACC غلط" } });
  assert.equal(back.status, 400);
  assert.match(JSON.stringify(back.body), /لحد/);
  assert.equal((await call(`/settings/holidays/${made.body.id}`, { method: "DELETE", cookie: admin })).status, 204);
  assert.equal((await call(`/settings/holidays/${made.body.id}`, { method: "DELETE", cookie: admin })).status, 404);
  assert.deepEqual((await prisma.auditLog.findMany({ where: { entity: "Holiday", entityId: made.body.id }, orderBy: { at: "asc" } })).map((a) => a.action), ["create", "delete"]);
});

test("notification rules: the admin turns email off for an event; my own email preference", async () => {
  const rules = (await call("/notifications/rules", { cookie: admin })).body;
  assert.ok(rules.some((r: { key: string }) => r.key === "lead.pulled"));
  assert.equal((await call("/notifications/rules/hr.excuse", { method: "PUT", cookie: sales, body: { channels: ["app"] } })).status, 403);
  const since = new Date();
  const saved = await prisma.notificationRule.findUnique({ where: { event: "procurement.request" } });
  try {
    assert.equal((await call("/notifications/rules/procurement.request", { method: "PUT", cookie: admin, body: { channels: ["app", "push"] } })).status, 200);
    await call("/notifications/rules/procurement.request", { method: "PUT", cookie: admin, body: { channels: ["app", "push", "email"] } });
    // audited with what it was, in the same transaction as the change
    const trail = await prisma.auditLog.findMany({ where: { entity: "NotificationRule", entityId: "procurement.request", at: { gte: since } }, orderBy: { at: "asc" } });
    assert.deepEqual(trail.map((a) => [a.before, a.after]).at(-1), [{ channels: ["app", "push"] }, { channels: ["app", "push", "email"] }]);
  } finally { // the rule as it was: no row means the default
    if (saved) await prisma.notificationRule.update({ where: { event: saved.event }, data: saved });
    else await prisma.notificationRule.deleteMany({ where: { event: "procurement.request" } });
  }
  assert.equal((await call("/notifications/preferences", { method: "PUT", cookie: sales, body: { emailNotifications: false } })).status, 204);
  await call("/notifications/preferences", { method: "PUT", cookie: sales, body: { emailNotifications: true } });
});

test("change my password: the old one stops working", async () => {
  // its own throwaway account: changing a seeded person's password ends their sessions, and other test files
  // (no-answer.e2e) sign in as them at the same moment → random 401s there
  const own = `pw-${stamp}@places.test`;
  await prisma.user.create({ data: { email: own, status: "ACTIVE", passwordHash: await hash(PW) } });
  const cookie = await session(own);
  assert.equal((await call("/auth/password", { method: "POST", cookie, body: { current: "wrong", next: "Changed12345" } })).status, 400);
  assert.equal((await call("/auth/password", { method: "POST", cookie, body: { current: PW, next: "Changed12345" } })).status, 204);
  assert.equal((await login(own)).status, 401);
  assert.equal((await login(own, "Changed12345")).status, 200);
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
  // other test files open and stop accounts in parallel, so the count can move by a few between the two calls
  const active = (await call("/access/users?status=ACTIVE&pageSize=100", { cookie: nancy })).body.total;
  assert.ok(Math.abs(sheet.rowCount - 1 - active) <= 5, `${sheet.rowCount - 1} rows vs ${active} active`);
  assert.equal((await fetch(`${API}/access/users/export`, { headers: { cookie: sales } })).status, 403);
  const log = await call("/access/audit?entityId=export", { cookie: nancy });
  assert.equal(log.body.items[0].action, "export");
});

/** An .xlsx in memory with these rows under the holidays template headers. */
async function holidaySheet(rows: unknown[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Sheet1");
  sheet.addRow(["الإجازة", "ملاحظة", "من", "لحد"]); // any column order, extra columns ignored
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
    ["E2E-ACC عيد", "", new Date(Date.UTC(2091, 3, 10)), ""], // a real Excel date cell · «لحد» empty = one day
    ["E2E-ACC غلط", "", "2091-02-30", ""],
    ["", "", "", ""],                                       // blank line: skipped
    ["E2E-ACC مكرر", "", "2091-04-10", "2091-04-10"],
    ["x", "", "2091-05-01", "2091-04-01"],                  // short name, and «لحد» before «من»
  ]);
  const p = await (await upload("/settings/holidays/import/preview", bad, admin)).json();
  assert.equal(p.total, 4);
  assert.equal(p.valid, 1);
  assert.deepEqual(p.errors.map((e: { line: number }) => e.line), [3, 5, 6]);
  assert.equal(p.errors[0].column, "من");
  assert.deepEqual([p.sample[0].from, p.sample[0].to], ["2091-04-10", "2091-04-10"]);
  assert.equal((await upload("/settings/holidays/import", bad, admin)).status, 400);
  assert.equal(await prisma.holiday.count({ where: { label: { startsWith: "E2E-ACC" } } }), 0);

  const csv = new Blob(["من,لحد,الإجازة\n2091-04-10,,E2E-ACC عيد\n2091-07-23,2091-07-24,E2E-ACC ثورة\n"]);
  assert.equal((await upload("/settings/holidays/import", csv, sales, "h.csv")).status, 403);
  const done = await upload("/settings/holidays/import", csv, admin, "h.csv");
  assert.deepEqual(await done.json(), { imported: 2 });
  const saved = await prisma.holiday.findMany({ where: { label: { startsWith: "E2E-ACC" } }, orderBy: { from: "asc" } });
  const day = (d: Date) => d.toISOString().slice(0, 10);
  assert.deepEqual(saved.map((h) => [day(h.from), day(h.to)]), [["2091-04-10", "2091-04-10"], ["2091-07-23", "2091-07-24"]]); // no timezone shift
  // the same sheet again: the same ranges, no second copy
  assert.deepEqual(await (await upload("/settings/holidays/import", csv, admin, "h.csv")).json(), { imported: 2 });
  assert.equal(await prisma.holiday.count({ where: { label: { startsWith: "E2E-ACC" } } }), 2);
  const log = await call("/access/audit?entityId=import", { cookie: nancy });
  assert.equal(log.body.items[0].action, "import");
  assert.deepEqual(log.body.items[0].after, { rows: 2 });

  const missing = await (await upload("/settings/holidays/import/preview", new Blob(["day,label\n"]), admin, "h.csv")).json();
  assert.match(missing.errors[0].message, /أعمدة ناقصة/);
});
