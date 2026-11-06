/**
 * 0.11 · M-12 «أي جدول في السيستم يتصدّر Excel»: the clients & owners list, the day's attendance and the purchase
 * requests download as .xlsx — the filtered list, in the reader's scope, for `export` holders only, audited — and an
 * owner's number never reaches the file of someone who can't see it (M-10 4.1).
 * The admin and Basant (HR) and Ahmed Ashraf (accountant) export · Mohamed Mohsen (sales), a Team Leader and
 * Mokhtar (procurement) don't · a throwaway Operations account with «clients: view · export» exports without seeing owner numbers.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { API, PW, cleanup, session } from "./helpers.ts";

const START = new Date();
const stamp = String(START.getTime());
const P = `E2E export ${stamp}`; // own word: files start in the same millisecond
const phone = (n: number) => `0158${stamp.slice(-6)}${n}`; // own prefix: other e2e files use 010 · 011 · 012 · 0155 · 0157
const DAY = "2019-03-12"; // a past Tuesday nobody else writes
let admin: string, basant: string, ashraf: string, mohsen: string, tl: string, mokhtar: string, opsNoNumbers: string;
const ids = { clients: [] as string[], purchases: [] as string[], attendance: "", user: "" };
let mohsenName = "";

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } }, status: "ACTIVE" }, select: { email: true } })).email;
  [admin, basant, ashraf, mohsen, tl, mokhtar] = await Promise.all([adminEmail, "basant.elsawy@places.com", "ahmed.ashraf@places.com", "m.mohsen@places.com", "mahmoud.ali@places.com", "mokhtar.gamal@places.com"].map((e) => session(e)));
  // its own account, so a shared role's permissions never change under the other test files
  const ops = await prisma.role.findUniqueOrThrow({ where: { key: "ops" } });
  ids.user = (await prisma.user.create({ data: { email: `export-${stamp}@places.test`, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: { roleId: ops.id, primary: true } }, overrides: { create: { module: "clients", actions: ["view", "export"] } } } })).id;
  opsNoNumbers = await session(`export-${stamp}@places.test`);

  ids.clients.push((await prisma.client.create({ data: { name: `${P} مالك`, kind: "owner", phones: { create: [{ phone: phone(1) }] } } })).id);
  ids.clients.push((await prisma.client.create({ data: { name: `${P} عميل`, kind: "client", company: `${P} شركة`, phones: { create: [{ phone: phone(2) }] } } })).id);

  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } }, select: { id: true, name: true } });
  mohsenName = emp.name;
  ids.attendance = (await prisma.attendanceDay.create({ data: { employeeId: emp.id, day: new Date(`${DAY}T00:00:00Z`), checkInAt: new Date(`${DAY}T09:36:00Z`), lateMinutes: 36, deduction: 0.25, source: "sheet" } })).id;

  const line = await prisma.account.findFirstOrThrow({ where: { code: "5207" }, select: { id: true } });
  const mokhtarId = (await prisma.user.findUniqueOrThrow({ where: { email: "mokhtar.gamal@places.com" } })).id;
  for (const [n, status] of [[1, "Pending"], [2, "Approved"]] as const) {
    ids.purchases.push((await prisma.purchase.create({ data: { item: `${P} ${n}`, amount: "1250.50", accountId: line.id, vendor: P, status, createdById: mokhtarId } })).id);
  }
});

cleanup(async () => {
  await prisma.purchase.deleteMany({ where: { id: { in: ids.purchases } } });
  await prisma.attendanceDay.deleteMany({ where: { id: ids.attendance } });
  await prisma.client.deleteMany({ where: { id: { in: ids.clients } } });
  await prisma.auditLog.deleteMany({ where: { at: { gte: START }, action: "export", entityId: "export", entity: { in: ["Client", "AttendanceDay", "Purchase"] }, userId: { in: [ids.user, ...(await prisma.user.findMany({ where: { email: { in: ["basant.elsawy@places.com", "ahmed.ashraf@places.com"] } }, select: { id: true } })).map((u) => u.id)] } } });
  if (ids.user) {
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: ids.user }, { entityId: ids.user }] } });
    await prisma.user.delete({ where: { id: ids.user } });
  }
});

/** The sheet as rows of plain values, header first. */
async function sheet(path: string, cookie: string) {
  const res = await fetch(`${API}${path}`, { headers: { cookie } });
  assert.equal(res.status, 200, await res.clone().text());
  assert.match(res.headers.get("content-type") ?? "", /spreadsheetml/);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
  const ws = book.worksheets[0]!;
  const rows: unknown[][] = [];
  ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1)));
  return rows;
}
const status = async (path: string, cookie: string) => (await fetch(`${API}${path}`, { headers: { cookie } })).status;
const audited = (entity: string) => prisma.auditLog.findFirst({ where: { entity, entityId: "export", action: "export", at: { gte: START } } });

test("clients: the filtered list with the owner's number for who may see it (admin); sales without «export» → 403", async () => {
  const rows = await sheet(`/clients/export?q=${encodeURIComponent(P)}`, admin);
  assert.deepEqual(rows[0], ["الاسم", "الشركة", "الأرقام", "النوع", "الوحدات", "الصفقات", "الحالة", "آخر تواصل"]);
  assert.equal(rows.length, 3);
  const byName = new Map(rows.slice(1).map((r) => [r[0], r]));
  assert.equal(byName.get(`${P} مالك`)![2], phone(1));
  assert.equal(byName.get(`${P} مالك`)![3], "مالك");
  assert.equal(byName.get(`${P} عميل`)![2], phone(2));
  assert.equal(byName.get(`${P} عميل`)![1], `${P} شركة`);
  // the tab «ملاك» is the filter: only the owner
  assert.deepEqual((await sheet(`/clients/export?q=${encodeURIComponent(P)}&kind=owner`, admin)).slice(1).map((r) => r[0]), [`${P} مالك`]);
  assert.equal(await status("/clients/export", mohsen), 403);
  assert.ok(await audited("Client"));
});

test("clients: an exporter who may not see owners' numbers gets the owner's cell empty, the client's number kept", async () => {
  const rows = await sheet(`/clients/export?q=${encodeURIComponent(P)}`, opsNoNumbers);
  const byName = new Map(rows.slice(1).map((r) => [r[0], r]));
  assert.equal(rows.length, 3);
  assert.ok(!byName.get(`${P} مالك`)![2]); // blank cell
  assert.ok(!JSON.stringify(rows).includes(phone(1)));
  assert.equal(byName.get(`${P} عميل`)![2], phone(2));
  // and the number search can't find the owner's file through the export either
  assert.equal((await sheet(`/clients/export?q=${phone(1)}`, opsNoNumbers)).length, 1);
});

test("attendance: HR exports the day on the screen (name search included); a Team Leader without «export» → 403", async () => {
  const rows = await sheet(`/hr/attendance/export?day=${DAY}&q=${encodeURIComponent(mohsenName)}`, basant);
  assert.deepEqual(rows[0], ["اليوم", "الموظف", "القسم", "Check-in", "Check-out", "Visit", "الحالة", "دقايق", "الخصم", "مبلغ الخصم"]);
  assert.equal(rows.length, 2);
  const [day, name, , checkIn, , , , late, deduction] = rows[1]!;
  assert.deepEqual([day, name, checkIn, late, deduction], [DAY, mohsenName, "11:36", 36, "ربع يوم"]);
  assert.equal(await status(`/hr/attendance/export?day=${DAY}`, tl), 403);
  assert.equal(await status(`/hr/attendance/export?day=${DAY}`, mohsen), 403);
  assert.ok(await audited("AttendanceDay"));
});

test("procurement: the accountant exports the filtered requests; Mokhtar (no «export») → 403", async () => {
  const all = await sheet(`/procurement/purchases/export?vendor=${encodeURIComponent(P)}`, ashraf);
  assert.deepEqual(all[0]!.slice(0, 6), ["الطلب", "الحاجة", "المبلغ", "البند", "المورد", "الحالة"]);
  assert.deepEqual(all.slice(1).map((r) => [r[1], r[2], r[4], r[5]]).sort(), [[`${P} 1`, 1250.5, P, "Pending"], [`${P} 2`, 1250.5, P, "Approved"]]);
  const approved = await sheet(`/procurement/purchases/export?vendor=${encodeURIComponent(P)}&status=Approved`, ashraf);
  assert.deepEqual(approved.slice(1).map((r) => r[1]), [`${P} 2`]);
  assert.equal(await status("/procurement/purchases/export", mokhtar), 403);
  assert.equal(await status("/procurement/purchases/export", mohsen), 403);
  assert.ok(await audited("Purchase"));
});
