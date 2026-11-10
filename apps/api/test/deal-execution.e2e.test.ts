/**
 * M-02 3.1 «ميعاد تنفيذ الصفقة» (Office Manager) and «مراجعة أوراق الصفقة» (Finance), the note kept to those two, and the
 * deals Excel export — against the real API and database; then the KPI job (M-12 dealExec · paperErrors) reads them.
 * Nancy is the Office Manager, Ahmed Ashraf Finance, Mohamed Mohsen a salesperson on the deal; nobody holds «salesdir»
 * in the seed, so this file makes a Sales Director of its own.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { isWorkingDay, localDate } from "@places/domain";
import { kpiRefreshTick } from "../../worker/src/processors/kpi-refresh.ts";
import { API, PW, call, kpiQuarterLock, mark, session } from "./helpers.ts";

const stamp = String(Date.now());
const C = `E2E-EXEC ${stamp}`;
const start = new Date();
let nancy: string, ashraf: string, mohsen: string, director: string, unitId: string;
let dealId: string, pendingId: string, nancyUser: string;
let kpiBefore: Array<{ id: string; value: unknown }> = [];

before(async () => {
  [nancy, ashraf, mohsen] = await Promise.all(["nancy.islam@places.com", "ahmed.ashraf@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const email = `e2e-exec-dir-${stamp}@example-deal.test`; // not @places.test: access.e2e removes those at its end
  await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: { primary: true, role: { connect: { key: "salesdir" } } } },
    employee: { create: { name: `${C} Sales Director`, jobTitle: "Sales Director", department: "Sales", salary: 0, target: 0, commissionPct: 0 } } } }); // «dept» scope: sees every deal
  director = await session(email);
  nancyUser = (await prisma.user.findUniqueOrThrow({ where: { email: "nancy.islam@places.com" } })).id;
  const mohsenEmp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  unitId = (await prisma.unit.create({ data: { code: `U-EX${stamp}`, type: "Rent", project: `${C} مشروع`, area: "التجمع الخامس", space: 300, condition: "Finished", pdfStatus: "confirmed" } })).id;
  const deal = (code: string, status: "APPROVED" | "PENDING_REVIEW") => prisma.deal.create({ data: {
    code, unitId, type: "Rent", space: 300, location: `${C} مشروع`, company: `${C} شركة`, source: "Facebook", status,
    commissionOwner: "40000", commissionClient: "60000", closedAt: new Date(), createdById: "e2e",
    participants: { create: [{ employeeId: mohsenEmp.id, side: "BUYER" }] },
  } });
  dealId = (await deal(`D-EX${stamp}`, "APPROVED")).id;
  pendingId = (await deal(`D-EXP${stamp}`, "PENDING_REVIEW")).id;
  mark(dealId, pendingId, `D-EX${stamp}`);
});

after(async () => {
  for (const it of kpiBefore) await prisma.kpiItem.update({ where: { id: it.id }, data: { value: it.value as never } });
  // found by this file's stamp, so a failed `before` still leaves nothing behind
  const deals = (await prisma.deal.findMany({ where: { unit: { code: `U-EX${stamp}` } }, select: { id: true } })).map((d) => d.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: deals } }, { module: "deals", entityId: "export", userId: nancyUser ?? "-", at: { gte: start } },
    { module: "kpis", entity: "KpiItem", action: "refresh", at: { gte: start } }] } });
  await prisma.notification.deleteMany({ where: { text: { contains: `D-EX${stamp}` } } });
  await prisma.deal.deleteMany({ where: { id: { in: deals } } });
  await prisma.unit.deleteMany({ where: { code: `U-EX${stamp}` } });
  const users = (await prisma.user.findMany({ where: { email: `e2e-exec-dir-${stamp}@example-deal.test` }, select: { id: true } })).map((u) => u.id);
  await prisma.employee.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

const put = (cookie: string, path: string, body: object, id = dealId) => call(`/deals/${id}/${path}`, { method: "PUT", cookie, body });

test("«ميعاد تنفيذ الصفقة»: only the Office Manager sets it and marks it done, once; audited", async () => {
  const today = localDate(new Date());
  assert.equal((await put(mohsen, "execution", { execDueAt: today })).status, 403); // salesperson on the deal
  assert.equal((await put(ashraf, "execution", { execDueAt: today })).status, 403); // Finance
  assert.equal((await put(director, "execution", { execDueAt: today })).status, 403);
  assert.equal((await put(nancy, "execution", {})).status, 400);
  assert.equal((await put(nancy, "execution", { execDueAt: today }, pendingId)).status, 400); // not approved yet

  const set = await put(nancy, "execution", { execDueAt: today });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.deepEqual([set.body.execDueAt, set.body.executedAt], [today, null]);
  const done = await put(nancy, "execution", { executed: true });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.executedAt, today);
  assert.equal((await put(nancy, "execution", { executed: true })).status, 400); // once

  const audit = await prisma.auditLog.findMany({ where: { entityId: dealId, action: "execution" }, orderBy: { at: "asc" } });
  assert.deepEqual(audit.map((a) => [a.before, a.after]), [[{ execDueAt: null }, { execDueAt: today }], [{ executedAt: null }, { executedAt: today }]]);
  // the salesperson sees it on his deal, read-only
  assert.equal((await call(`/deals/${dealId}`, { cookie: mohsen })).body.executedAt, today);
});

test("«مراجعة أوراق الصفقة»: only Finance; an error needs what's wrong and tells the Office Manager; audited", async () => {
  assert.equal((await put(mohsen, "papers", { ok: true })).status, 403);
  assert.equal((await put(nancy, "papers", { ok: true })).status, 403); // the Office Manager doesn't review papers
  assert.equal((await put(director, "papers", { ok: true })).status, 403);
  assert.equal((await put(ashraf, "papers", { ok: false })).status, 400);
  assert.equal((await put(ashraf, "papers", { ok: true }, pendingId)).status, 400);

  const ok = await put(ashraf, "papers", { ok: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual([ok.body.papersOk, ok.body.papersNote], [true, null]);
  const bad = await put(ashraf, "papers", { ok: false, note: "التفويض ناقص إمضاء" });
  assert.equal(bad.status, 200, JSON.stringify(bad.body));
  assert.deepEqual([bad.body.papersOk, bad.body.papersNote], [false, "التفويض ناقص إمضاء"]);

  const told = await prisma.notification.findFirst({ where: { userId: nancyUser, event: "deal.papers", text: { contains: `D-EX${stamp}` } } });
  assert.equal(told?.text, `أوراق D-EX${stamp} فيها خطأ: التفويض ناقص إمضاء`);
  const audit = await prisma.auditLog.findFirst({ where: { entityId: dealId, action: "papers" }, orderBy: { at: "desc" } });
  assert.deepEqual([audit!.before, audit!.after], [{ papersOk: true, papersNote: null }, { papersOk: false, papersNote: "التفويض ناقص إمضاء" }]);
});

test("the note (M-02 3.1) is the Office Manager's and Finance's: the Sales Director only follows (4.1)", async () => {
  const body = { note: `${C} التارجت بمبلغ تاني`, targetBase: null };
  assert.equal((await put(director, "note", body)).status, 403);
  assert.equal((await call(`/deals/${dealId}`, { cookie: director })).status, 200); // he still sees the deal
  const r = await put(nancy, "note", body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.note, body.note);
});

test("«تصدير الصفقات»: the filtered list as .xlsx for «deals: export», audited; a salesperson gets 403", async () => {
  const q = new URLSearchParams({ sheet: "1", q: C });
  const res = await fetch(`${API}/deals/export?${q}`, { headers: { cookie: nancy } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /spreadsheetml/);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
  const sheet = book.worksheets[0]!;
  const head = (sheet.getRow(1).values as unknown[]).slice(1);
  const row = Object.fromEntries(head.map((h, i) => [h, sheet.getRow(2).getCell(i + 1).value]));
  assert.equal(sheet.rowCount, 2); // the approved deal only: the pending one isn't on the sheet
  assert.equal(row["الصفقة"], `D-EX${stamp}`);
  assert.equal(row["العمولة المتوقعة"], 100000);
  assert.equal(row["ميعاد التنفيذ"], localDate(new Date()));
  assert.equal(row["أوراق الصفقة"], "فيها خطأ: التفويض ناقص إمضاء");
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "deals", entityId: "export", userId: nancyUser, at: { gte: start } } }));

  const all = await fetch(`${API}/deals/export?q=${encodeURIComponent(C)}`, { headers: { cookie: nancy } }); // the board: every status
  const book2 = new ExcelJS.Workbook();
  await book2.xlsx.load(Buffer.from(await all.arrayBuffer()) as never);
  assert.equal(book2.worksheets[0]!.rowCount, 3);
  assert.equal((await fetch(`${API}/deals/export`, { headers: { cookie: mohsen } })).status, 403);
});

// the job measures the current quarter: Q4 2026, which kpis.e2e closes for a while under the same lock
test("M-12: the KPI job now has numbers for «تنفيذ الصفقات في ميعادها» and «أخطاء الورق»", () => kpiQuarterLock(async () => {
  const items = await prisma.kpiItem.findMany({ where: { metric: { in: ["dealExec", "paperErrors"] }, card: { quarter: "2026-Q4" } }, select: { id: true, value: true, metric: true, card: { select: { employeeId: true } } } });
  assert.ok(items.some((i) => i.metric === "dealExec") && items.some((i) => i.metric === "paperErrors"), "the seeded Q4 cards carry both items");
  kpiBefore = items.map((i) => ({ id: i.id, value: i.value }));
  let t = new Date();
  while (!isWorkingDay(localDate(t))) t = new Date(t.getTime() + 24 * 3600_000); // the job does nothing on Fridays
  await kpiRefreshTick(t, [...new Set(items.map((i) => i.card.employeeId))]);
  for (const it of await prisma.kpiItem.findMany({ where: { id: { in: items.map((i) => i.id) } } })) {
    assert.notEqual(it.value, null, `${it.metric} has a number`);
    if (it.metric === "paperErrors") assert.ok(Number(it.value) >= 1, "this deal's papers error counts");
    if (it.metric === "dealExec") assert.ok(Number(it.value) > 0, "this deal was executed on time");
  }
}));
