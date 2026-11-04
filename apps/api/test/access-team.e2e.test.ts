/**
 * M-09 · 12.1 the org structure from the KPI file · 12.2 who manages what (Operations Head → his team only, HR →
 * accounts only) · 12.5 the Audit Log (filters, device, export), «مين عنده أنهي صلاحية», the Super Admin's alerts.
 * Test accounts end in @org.test (not @places.test: the other access file deletes those when it ends).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import ExcelJS from "exceljs";
import { API, call, lastMail, login, session, tokenIn } from "./helpers.ts";

const PW = "OrgTest12345x";
const stamp = Date.now();
const mail = (who: string) => `${who}-${stamp}@org.test`;
let nancy: string, admin: string, hr: string, sales: string;
let head: string, headUser: string, headEmployee: string, member: string, outsider: string, nancyId: string;

/** Created by Nancy (Office Manager), activated through the emailed link like a real person. */
async function account(who: string, role: string, managerId: string | null = null) {
  const since = Date.now();
  const r = await call("/access/users", { method: "POST", cookie: nancy, body: { name: `تجربة ${who}`, email: mail(who), department: "Inventory", role, managerId } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await call("/auth/activate", { method: "POST", body: { token: tokenIn(lastMail(mail(who), since).text), password: PW } })).status, 204);
  return r.body as { id: string; employee: { id: string; managerId: string | null } };
}

before(async () => {
  [nancy, admin, hr, sales] = await Promise.all([
    session("nancy.islam@places.com"), session("ahmed.islam@places.com"), session("basant.elsawy@places.com"), session("m.mohsen@places.com"),
  ]);
  nancyId = (await call("/auth/me", { cookie: nancy })).body.id;
  const h = await account("head", "opshead");
  [headUser, headEmployee] = [h.id, h.employee.id];
  head = await session(mail("head"), PW);
  const m = await account("member", "inventory_staff", headEmployee);
  assert.equal(m.employee.managerId, headEmployee);
  member = m.id;
  outsider = (await account("outsider", "inventory_staff")).id;
});

after(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: "@org.test" } }, select: { id: true } });
  await prisma.employee.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
});

test("12.1 the seed's org structure (M-09 7.2): everyone but the two owners has a manager", async () => {
  const people = await prisma.employee.findMany({ where: { user: { email: { endsWith: "@places.com" } } }, select: { name: true, managerId: true, id: true } });
  const byId = new Map(people.map((p) => [p.id, p.name]));
  const managerOf = (name: string) => byId.get(people.find((p) => p.name === name)!.managerId ?? "");
  assert.deepEqual(people.filter((p) => !p.managerId).map((p) => p.name).sort(), ["أحمد إسلام", "محمد صفوت"]);
  assert.equal(managerOf("نانسي إسلام"), "محمد صفوت");
  assert.equal(managerOf("مصطفى عزت"), "أحمد إسلام"); // a Team Leader
  assert.equal(managerOf("هدير طارق"), "هبة صلاح");
  assert.equal(managerOf("سارة عبدالحليم"), "منار أحمد");
  assert.equal(managerOf("عبدالرحمن بيومي"), "رحمة حسن");
  assert.equal(managerOf("محمد محسن"), "عبدالله سليم"); // a salesperson follows their TL
});

test("12.1 editing an account keeps its manager unless a new one is chosen", async () => {
  const body = { name: "تجربة member", email: mail("member"), department: "Inventory", role: "inventory_staff" };
  assert.equal((await call(`/access/users/${member}`, { method: "PUT", cookie: nancy, body })).body.employee.managerId, headEmployee);
});

test("12.2 the Operations Head edits his team's exceptions, inside his own permissions", async () => {
  const r = await call(`/access/users/${member}/permissions`, { method: "PATCH", cookie: head, body: { inventory: ["view", "export"] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.effective.inventory, ["view", "export"]);
  assert.equal(r.body.editable, true);
  const finance = await call(`/access/users/${member}/permissions`, { method: "PATCH", cookie: head, body: { finance: ["view"] } });
  assert.equal(finance.status, 403);
  assert.match(finance.body.error, /حدود صلاحياتك/);
  assert.equal((await call(`/access/users/${member}/permissions`, { method: "PATCH", cookie: head, body: { access: ["view", "edit"] } })).status, 403);
  assert.equal((await call(`/access/users/${member}/permissions`, { cookie: head })).body.editable, true);
});

test("12.2 … and nobody outside his team, nor himself, nor his own roles", async () => {
  const r = await call(`/access/users/${outsider}/permissions`, { method: "PATCH", cookie: head, body: { inventory: ["view"] } });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /فريقك بس/);
  assert.equal((await call(`/access/users/${outsider}/permissions`, { cookie: head })).body.editable, false);
  assert.equal((await call(`/access/users/${headUser}/permissions`, { method: "PATCH", cookie: head, body: { tasks: ["view"] } })).status, 403);
  assert.equal((await call(`/access/users/${member}`, { method: "PUT", cookie: head, body: { name: "x x", email: mail("member"), department: "x", role: "admin" } })).status, 403);
  assert.equal((await call("/access/roles/inventory_staff/permissions", { method: "PATCH", cookie: head, body: { inventory: ["view"] } })).status, 403);
});

test("12.2 HR creates and stops accounts, but can't touch permissions; sales can't do either", async () => {
  const since = Date.now();
  const r = await call("/access/users", { method: "POST", cookie: hr, body: { name: "تجربة HR", email: mail("hr-new"), department: "HR", role: "sales" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(lastMail(mail("hr-new"), since).subject, /فعّل حسابك/);
  assert.equal((await call(`/access/users/${r.body.id}/disable`, { method: "POST", cookie: hr })).status, 204);
  assert.equal((await call(`/access/users/${r.body.id}`, { cookie: hr })).body.status, "DISABLED");
  assert.equal((await call(`/access/users/${member}/permissions`, { method: "PATCH", cookie: hr, body: { finance: ["view"] } })).status, 403);
  assert.equal((await call("/access/roles/sales/permissions", { method: "PATCH", cookie: hr, body: { finance: ["view"] } })).status, 403);
  assert.equal((await call("/access/roles", { method: "POST", cookie: hr, body: { label: "E2E HR role", tier: "Executive Staff", scope: "own" } })).status, 403);
  assert.equal((await call(`/access/users/${member}`, { method: "PUT", cookie: hr, body: { name: "x x", email: mail("member"), department: "x", role: "sales" } })).status, 403);
  assert.equal((await call(`/access/users/${member}/disable`, { method: "POST", cookie: sales })).status, 403);
  assert.equal((await call("/access/users", { method: "POST", cookie: sales, body: { name: "x x", email: mail("s"), department: "x", role: "sales" } })).status, 403);
});

test("12.5 a permission change reaches the Super Admin", async () => {
  const items: { text: string }[] = (await call("/notifications?pageSize=50", { cookie: admin })).body.items;
  assert.ok(items.some((n) => n.text.includes("صلاحيات تجربة member اتعدّلت") && n.text.includes("تجربة head")));
  assert.equal((await call("/notifications?pageSize=50", { cookie: sales })).body.items.some((n: { text: string }) => n.text.includes("تجربة member")), false);
});

test("12.5 a strange sign-in (locked after 5 wrong passwords) reaches the Super Admin", async () => {
  for (let i = 0; i < 5; i++) await login(mail("outsider"), "wrong-password-1");
  const items: { text: string }[] = (await call("/notifications?pageSize=50", { cookie: admin })).body.items;
  assert.ok(items.some((n) => n.text.startsWith("دخول غريب") && n.text.includes(mail("outsider"))));
});

test("12.5 the Audit Log: by person and by day, with the device on every record", async () => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const r = await call(`/access/audit?userId=${headUser}&from=${today}&to=${today}`, { cookie: nancy });
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length >= 1);
  for (const x of r.body.items) {
    assert.equal(x.userId, headUser);
    assert.ok(x.userAgent, "device recorded");
  }
  assert.equal((await call(`/access/audit?userId=${headUser}&to=2000-01-01`, { cookie: nancy })).body.total, 0);
  assert.equal((await call("/access/audit?from=2026-02-30", { cookie: nancy })).status, 400);
  assert.equal((await call("/access/audit", { cookie: sales })).status, 403);
});

const xlsx = async (res: Response) => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
  return book.worksheets[0]!;
};

test("12.5 the Audit Log as Excel, same filters; whoever lacks «export» gets 403; the export is audited", async () => {
  const res = await fetch(`${API}/access/audit/export?userId=${headUser}`, { headers: { cookie: nancy } });
  assert.equal(res.status, 200);
  const sheet = await xlsx(res);
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), ["الوقت", "مين", "الموديول", "التغيير", "على", "قبل", "بعد", "الجهاز", "IP"]);
  const total = (await call(`/access/audit?userId=${headUser}`, { cookie: nancy })).body.total;
  assert.equal(sheet.rowCount - 1, total);
  assert.equal(sheet.getRow(2).getCell(2).value, "تجربة head");
  assert.ok(sheet.getRow(2).getCell(8).value, "device column filled");
  assert.equal((await fetch(`${API}/access/audit/export`, { headers: { cookie: hr } })).status, 403);
  const log = await call(`/access/audit?userId=${nancyId}&entityId=export&module=access`, { cookie: nancy });
  assert.ok(log.body.items.some((x: { entity: string }) => x.entity === "AuditLog"));
});

test("12.5 «مين عنده أنهي صلاحية»: one line per account with its effective permissions", async () => {
  const res = await fetch(`${API}/access/report/permissions`, { headers: { cookie: nancy } });
  assert.equal(res.status, 200);
  const sheet = await xlsx(res);
  const head = (sheet.getRow(1).values as unknown[]).slice(1);
  assert.deepEqual(head.slice(0, 6), ["الاسم", "الإيميل", "القسم", "الأدوار", "نطاق البيانات", "استثناءات"]);
  const col = head.indexOf("مخزون الوحدات") + 1;
  const row = sheet.getRows(2, sheet.rowCount - 1)!.find((r) => r.getCell(2).value === mail("member"))!;
  assert.equal(row.getCell(col).value, "يشوف · يصدّر"); // the exception the Operations Head gave
  assert.equal(row.getCell(6).value, "مخزون الوحدات");
  assert.equal((await fetch(`${API}/access/report/permissions`, { headers: { cookie: sales } })).status, 403);
});
