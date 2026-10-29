/**
 * Phase 1 end-to-end (M-09 · M-13 · M-14) against the real API and database.
 * Nancy (Office Manager) manages accounts; Ahmed Islam (Super Admin) edits settings; Mohsen is a salesperson.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { PW, call, lastMail, login, session, tokenIn } from "./helpers.ts";

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
  await prisma.holiday.deleteMany({ where: { label: "E2E holiday" } });
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
