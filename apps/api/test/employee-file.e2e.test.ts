/**
 * M-05 · the employee file (HR, 15 Nov): HR uploads a paper through core/files, the required list shows ✓ / missing and
 * the list's «ورق ناقص», each download and delete is audited; a saved 1-to-1 leaves its PDF sheet; the timeline has the
 * papers, the 1-to-1s and the penalties; the 1-to-1 coverage (salespeople) and the from–to report with its Excel. The
 * admin views; a Team Leader and sales get 403.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const START = new Date();
const P = `E2E file ${START.getTime()}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const PDF = Buffer.from("%PDF-1.4\n%e2e\n");
let basant: string, admin: string, tl: string, sales: string;
let target: { id: string; userId: string };
const files: string[] = [];

before(async () => {
  const adminEmail = (await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "admin" } } } }, select: { email: true } })).email;
  [basant, admin, tl, sales] = await Promise.all(["basant.elsawy@places.com", adminEmail, "mahmoud.ali@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "sales" } });
  // INVITED: a salesperson for the coverage, never paid by payroll while this file runs
  const u = await prisma.user.create({ data: { email: `e2e-file-${START.getTime()}@hr.test`, status: "INVITED", roles: { create: { roleId: role.id } }, employee: { create: { name: P, jobTitle: "Sales", department: "Sales", salary: 0 } } }, include: { employee: true } });
  target = { id: u.employee!.id, userId: u.id };
});
after(async () => {
  if (target) {
    const docs = (await prisma.employeeDocument.findMany({ where: { employeeId: target.id }, select: { id: true, fileId: true } }));
    const ones = (await prisma.oneOnOne.findMany({ where: { employeeId: target.id }, select: { id: true } })).map((o) => o.id);
    const pens = (await prisma.penalty.findMany({ where: { employeeId: target.id }, select: { id: true } })).map((p) => p.id);
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...docs.map((d) => d.id), ...ones, ...pens, ...files] } }, { entity: "Setting", entityId: "employeeDocTypes", at: { gte: START } }] } });
    await prisma.employeeDocument.deleteMany({ where: { employeeId: target.id } });
    await prisma.file.deleteMany({ where: { id: { in: [...files, ...docs.map((d) => d.fileId).filter((x): x is string => !!x)] } } });
    await prisma.oneOnOne.deleteMany({ where: { employeeId: target.id } });
    await prisma.penalty.deleteMany({ where: { employeeId: target.id } });
    await prisma.employee.deleteMany({ where: { id: target.id } });
    await prisma.user.deleteMany({ where: { id: target.userId } });
  }
  await prisma.setting.deleteMany({ where: { key: "employeeDocTypes" } });
  await prisma.$disconnect();
});

async function upload(cookie: string) {
  const t = await call("/files/uploads", { method: "POST", cookie, body: { name: "fish.pdf", mime: "application/pdf", size: PDF.length } });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  files.push(t.body.id);
  assert.equal((await fetch(t.body.url, { method: "PUT", headers: t.body.headers, body: PDF })).status, 200);
  assert.equal((await call(`/files/${t.body.id}/complete`, { method: "POST", cookie })).status, 200);
  return t.body.id as string;
}

test("HR uploads a required paper: ✓ in the list, «ورق ناقص» goes down, download and delete audited", async () => {
  const before = (await call(`/hr/employees/${target.id}/documents`, { cookie: basant })).body;
  assert.equal(before.required.length, 6); // the starter list (client to confirm)
  assert.equal(before.missing, 6);
  assert.equal((await call("/hr/employee-docs/missing", { cookie: basant })).body[target.id], 6);

  const fileId = await upload(basant);
  const up = await call(`/hr/employees/${target.id}/documents`, { method: "POST", cookie: basant, body: { fileId, title: `${P} فيش`, docType: "فيش وتشبيه" } });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  // the same file can't be attached twice
  assert.equal((await call(`/hr/employees/${target.id}/documents`, { method: "POST", cookie: basant, body: { fileId, title: "تاني" } })).status, 400);
  const v = (await call(`/hr/employees/${target.id}/documents`, { cookie: basant })).body;
  assert.equal(v.missing, 5);
  assert.equal(v.required.find((r: { type: string }) => r.type === "فيش وتشبيه").docId, up.body.id);
  assert.ok(v.timeline.some((x: { kind: string; docId: string }) => x.kind === "upload" && x.docId === up.body.id));
  assert.equal((await call("/hr/employee-docs/missing", { cookie: basant })).body[target.id], 5);

  const link = await call(`/hr/employee-docs/${up.body.id}/url`, { cookie: admin }); // the admin views and downloads
  assert.equal(link.status, 200);
  assert.equal((await fetch(link.body.url)).status, 200);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "EmployeeDocument", entityId: up.body.id, action: "download" } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "EmployeeDocument", entityId: up.body.id, action: "create" } }));

  assert.equal((await call(`/hr/employee-docs/${up.body.id}`, { method: "DELETE", cookie: admin })).status, 403); // admin views only (Q49)
  assert.equal((await call(`/hr/employee-docs/${up.body.id}`, { method: "DELETE", cookie: basant })).status, 200);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "EmployeeDocument", entityId: up.body.id, action: "delete" } }));
  assert.equal((await call(`/hr/employees/${target.id}/documents`, { cookie: basant })).body.missing, 6);
});

test("only HR and the admins: a Team Leader and sales (even the employee himself) get 403", async () => {
  for (const cookie of [tl, sales]) {
    assert.equal((await call(`/hr/employees/${target.id}/documents`, { cookie })).status, 403);
    assert.equal((await call("/hr/employee-docs/missing", { cookie })).status, 403);
    assert.equal((await call(`/hr/one-on-one/coverage`, { cookie })).status, 403);
  }
  assert.equal((await call(`/hr/employees/${target.id}/documents`, { method: "POST", cookie: admin, body: { fileId: "x", title: "xx" } })).status, 403);
});

test("HR edits the required list (audited)", async () => {
  const r = await call("/hr/employee-docs/types", { method: "PUT", cookie: basant, body: { types: ["فيش وتشبيه", "عقد العمل"] } });
  assert.equal(r.status, 200);
  assert.deepEqual((await call("/hr/employee-docs/types", { cookie: basant })).body, ["فيش وتشبيه", "عقد العمل"]);
  assert.equal((await call(`/hr/employees/${target.id}/documents`, { cookie: basant })).body.missing, 2);
  assert.equal((await call("/hr/employee-docs/types", { method: "PUT", cookie: tl, body: { types: ["x"] } })).status, 403);
  await prisma.setting.deleteMany({ where: { key: "employeeDocTypes" } });
});

test("a 1-to-1 → its PDF sheet in the file; the timeline with the penalty; coverage and the report with its Excel", async () => {
  const month = today().slice(0, 7);
  let cov = (await call(`/hr/one-on-one/coverage?month=${month}`, { cookie: basant })).body;
  assert.equal(cov.items.find((i: { employeeId: string }) => i.employeeId === target.id).heldOn, null);

  const one = await call(`/hr/employees/${target.id}/one-on-one`, { method: "POST", cookie: basant, body: { heldOn: today(), answers: { "محتاج تدريب في إيه؟": `${P} Excel` }, hrAction: `${P} كورس`, hrActionDue: today() } });
  assert.equal(one.status, 201, JSON.stringify(one.body));
  const sheet = await prisma.employeeDocument.findFirst({ where: { refId: one.body.id, kind: "one_on_one" } });
  assert.ok(sheet?.fileId, "the 1-to-1's PDF sheet");
  assert.match(sheet.title, /^1-to-1 \S+ \d{4}$/);
  assert.equal(sheet.month, month);
  const link = (await call(`/hr/employee-docs/${sheet.id}/url`, { cookie: basant })).body;
  assert.ok(Buffer.from(await (await fetch(link.url)).arrayBuffer()).subarray(0, 5).toString() === "%PDF-");
  assert.equal((await call(`/hr/employee-docs/${sheet.id}`, { method: "DELETE", cookie: basant })).status, 400); // the system's sheet stays

  assert.equal((await call("/hr/penalties", { method: "POST", cookie: basant, body: { employeeId: target.id, day: today(), type: "سلوك", text: `${P} تأخير`, deductionDays: 0 } })).status, 201);
  const tl_ = (await call(`/hr/employees/${target.id}/documents`, { cookie: basant })).body.timeline;
  assert.ok(tl_.some((x: { kind: string; docId: string }) => x.kind === "one_on_one" && x.docId === sheet.id));
  assert.ok(tl_.some((x: { kind: string; title: string }) => x.kind === "penalty" && x.title === `${P} تأخير`));

  cov = (await call(`/hr/one-on-one/coverage?month=${month}`, { cookie: basant })).body;
  assert.equal(cov.items.find((i: { employeeId: string }) => i.employeeId === target.id).heldOn, today());

  const rep = await call(`/hr/one-on-one/report?from=${today()}&to=${today()}`, { cookie: basant });
  const row = rep.body.find((r: { id: string }) => r.id === one.body.id);
  assert.equal(row.name, P);
  assert.equal(row.summary, `محتاج تدريب في إيه؟: ${P} Excel`);
  assert.equal(row.hrActionDone, false);
  assert.equal((await call(`/hr/one-on-one/report?from=${today()}&to=2020-01-01`, { cookie: basant })).status, 400);
  const x = await fetch(`${API}/hr/one-on-one/report/export?from=${today()}&to=${today()}`, { headers: { cookie: basant } });
  assert.equal(x.status, 200);
  assert.match(x.headers.get("content-type") ?? "", /spreadsheetml/);
  assert.equal((await call(`/hr/one-on-one/report?from=${today()}&to=${today()}`, { cookie: tl })).status, 403);
});
