/**
 * M-05 · «التأمينات» (HR, 15 Nov): HR records an employee's insurance (audited, with files); the accountant hears of it
 * and sees it read-only in Finance; the monthly amount comes off the payroll net (9.14). A throwaway employee keeps the
 * other payroll tests' people untouched.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const START = new Date();
const P = `E2E insurance ${START.getTime()}`;
let hr: string, accountant: string, sales: string, admin: string, accountantId: string;
let emp: { userId: string };
const files: string[] = [];

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [hr, accountant, sales, admin] = await Promise.all(["basant.elsawy@places.com", "ahmed.ashraf@places.com", "m.mohsen@places.com", adminEmail].map((e) => session(e)));
  accountantId = (await prisma.user.findUniqueOrThrow({ where: { email: "ahmed.ashraf@places.com" } })).id;
  const u = await prisma.user.create({ data: { email: `e2e-insurance-${START.getTime()}@insurance.test`, status: "ACTIVE", employee: { create: { name: `${P} موظف`, jobTitle: "Accountant", department: "Accounts", salary: "10000" } } } });
  emp = { userId: u.id };
});

after(async () => {
  const row = await prisma.employeeInsurance.findUnique({ where: { userId: emp.userId } });
  if (row) await prisma.auditLog.deleteMany({ where: { entityId: row.id } });
  await prisma.employeeInsurance.deleteMany({ where: { userId: emp.userId } });
  await prisma.file.deleteMany({ where: { id: { in: files } } });
  await prisma.notification.deleteMany({ where: { OR: [{ userId: emp.userId }, { text: { contains: P } }] } });
  await prisma.payrollLine.deleteMany({ where: { userId: emp.userId } }); // the payroll test may run the month meanwhile
  await prisma.employee.deleteMany({ where: { userId: emp.userId } });
  await prisma.user.delete({ where: { id: emp.userId } });
  await prisma.$disconnect();
});

async function upload(cookie: string) {
  const body = Buffer.from("%PDF-1.4\n% insurance sheet\n%%EOF\n");
  const t = await call("/files/uploads", { method: "POST", cookie, body: { name: "استمارة 1.pdf", mime: "application/pdf", size: body.length } });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  files.push(t.body.id);
  assert.equal((await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body })).status, 200);
  assert.equal((await call(`/files/${t.body.id}/complete`, { method: "POST", cookie })).status, 200);
  return t.body.id as string;
}

test("only HR edits: sales and the admin can't save; sales can't see HR's or Finance's list", async () => {
  const body = { insured: true, since: "2026-01-01", provider: "التأمينات الاجتماعية", monthly: "1100" };
  for (const cookie of [sales, admin]) assert.equal((await call(`/hr/insurance/${emp.userId}`, { method: "PUT", cookie, body })).status, 403);
  assert.equal((await call("/hr/insurance", { cookie: sales })).status, 403);
  assert.equal((await call("/finance/insurance", { cookie: sales })).status, 403);
  assert.equal((await call(`/hr/insurance/${emp.userId}`, { method: "PUT", cookie: hr, body: { insured: true, monthly: "1100" } })).status, 400); // provider and «since» missing
});

test("HR records it with a file: audited, Finance notified and sees it, payroll deducts it", async () => {
  const fileId = await upload(hr);
  const r = await call(`/hr/insurance/${emp.userId}`, { method: "PUT", cookie: hr, body: { insured: true, since: "2026-01-01", provider: "التأمينات الاجتماعية", monthly: "1100", companyShare: "1900", note: `${P} ملاحظة`, files: [fileId] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.monthly, "1100.00");
  assert.equal(r.body.files.length, 1);
  const row = await prisma.employeeInsurance.findUniqueOrThrow({ where: { userId: emp.userId } });
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "EmployeeInsurance", entityId: row.id, action: "create" } }));
  const note = await prisma.notification.findFirst({ where: { userId: accountantId, text: { startsWith: `اتضاف تأمين لـ ${P} موظف: ` } } });
  assert.ok(note?.text.endsWith(" في الشهر"), note?.text);

  // HR's list with the filter, the file link, Finance's read-only view
  const yes = (await call("/hr/insurance?insured=yes", { cookie: hr })).body;
  assert.ok(yes.items.some((i: { userId: string }) => i.userId === emp.userId));
  assert.ok(!(await call("/hr/insurance?insured=no", { cookie: hr })).body.items.some((i: { userId: string }) => i.userId === emp.userId));
  assert.ok((await call(`/hr/insurance/${emp.userId}/files/${fileId}`, { cookie: hr })).body.url);
  const fin = await call("/finance/insurance", { cookie: accountant });
  assert.equal(fin.status, 200);
  assert.equal(fin.body.items.find((i: { userId: string }) => i.userId === emp.userId).monthly, "1100.00");
  assert.equal((await call(`/hr/insurance/${emp.userId}`, { method: "PUT", cookie: accountant, body: { insured: false } })).status, 403);
  const xlsx = await call("/hr/insurance/export", { cookie: hr });
  assert.equal(xlsx.status, 200);

  // payroll: 10,000 − 1,100 = 8,900 (no attendance deduction or advance on this new person)
  const pay = (await call("/finance/payroll", { cookie: accountant })).body;
  const line = pay.rows.find((x: { userId: string }) => x.userId === emp.userId);
  assert.equal(line.insurance, "1100.00");
  assert.equal(line.net, "8900.00");
  assert.ok(Number(pay.totals.insurance) >= 1100);
});

test("a change is audited and notified; stopping it takes it off payroll; a file can be removed", async () => {
  const r = await call(`/hr/insurance/${emp.userId}`, { method: "PUT", cookie: hr, body: { insured: true, since: "2026-01-01", provider: "شركة خاصة", monthly: "1200" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.files.length, 1); // files already attached stay
  assert.ok(await prisma.notification.findFirst({ where: { userId: accountantId, text: { startsWith: `اتعدّل تأمين ${P} موظف` } } }));
  const fileId = r.body.files[0].id;
  assert.equal((await call(`/hr/insurance/${emp.userId}/files/${fileId}`, { method: "DELETE", cookie: sales })).status, 403);
  assert.equal((await call(`/hr/insurance/${emp.userId}/files/${fileId}`, { method: "DELETE", cookie: hr })).status, 204);
  assert.equal((await prisma.employeeInsurance.findUniqueOrThrow({ where: { userId: emp.userId } })).files.length, 0);

  assert.equal((await call(`/hr/insurance/${emp.userId}`, { method: "PUT", cookie: hr, body: { insured: false } })).status, 200);
  assert.ok(await prisma.notification.findFirst({ where: { userId: accountantId, text: `اتوقف تأمين ${P} موظف` } }));
  const line = (await call("/finance/payroll", { cookie: accountant })).body.rows.find((x: { userId: string }) => x.userId === emp.userId);
  assert.equal(line.insurance, "0.00");
  assert.equal(line.net, "10000.00");
  assert.equal(await prisma.auditLog.count({ where: { entity: "EmployeeInsurance", userId: { not: "" }, at: { gte: START }, entityId: (await prisma.employeeInsurance.findUniqueOrThrow({ where: { userId: emp.userId } })).id } }), 4);
});
