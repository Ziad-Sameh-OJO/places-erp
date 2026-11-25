/**
 * 1.21 (M-01 6.1, «Companys archive» 28/10): the report of companies whose current contract ends soon (the demo's 90
 * days), by category, exported to Excel; and the archive imported through 13.1 (0.12) — one tab per category.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { API, PW, call, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E-R ${stamp}`;
let hadeer: string, heba: string, mohsen: string, cats: string[];
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

before(async () => {
  [hadeer, heba, mohsen] = await Promise.all(["hadeer.tarek@places.com", "heba.salah@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  cats = ((await call("/companies?pageSize=1", { cookie: hadeer })).body.categories as { name: string }[]).map((c) => c.name);
  const mk = (n: string, category: string, contractEnd: Date | null) => ({ name: `${NAME} ${n}`, category, contractEnd });
  await prisma.company.createMany({ data: [mk("قريب", cats[0]!, inDays(10)), mk("بعيد", cats[0]!, inDays(200)), mk("خلص", cats[0]!, inDays(-5)), mk("تاني", cats[1]!, inDays(30)), mk("من غير عقد", cats[0]!, null)] });
});
after(async () => {
  const ids = (await prisma.company.findMany({ where: { name: { startsWith: NAME } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Company", entityId: "report", at: { gte: new Date(Number(stamp)) } } });
  await prisma.$disconnect();
});

const names = async (q: string) => ((await call(`/companies?pageSize=100&q=${encodeURIComponent(NAME)}${q}`, { cookie: hadeer })).body.items as { name: string }[]).map((c) => c.name.slice(NAME.length + 1)).sort();

test("the report: contracts ending within 90 days from today (not ended, not later), by category", async () => {
  assert.deepEqual(await names("&endingWithin=90"), ["تاني", "قريب"]);
  assert.deepEqual(await names(`&endingWithin=90&category=${encodeURIComponent(cats[0]!)}`), ["قريب"]);
  assert.deepEqual(await names(""), ["بعيد", "تاني", "خلص", "قريب", "من غير عقد"]);
  assert.equal((await call("/companies?endingWithin=0", { cookie: hadeer })).status, 400);
});

test("the report exports to Excel for whoever may export leads (Operations); Telesales without «export» gets 403; audited", async () => {
  const res = await fetch(`${API}/companies/export?endingWithin=90&q=${encodeURIComponent(NAME)}`, { headers: { cookie: heba } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /spreadsheetml/);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
  const sheet = book.worksheets[0]!;
  assert.equal(sheet.getRow(1).getCell(2).value, "company name");
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getRow(2).getCell(2).value, `${NAME} قريب`); // the nearest end first
  assert.equal((await fetch(`${API}/companies/export`, { headers: { cookie: hadeer } })).status, 403);
  assert.equal((await fetch(`${API}/companies/export`, { headers: { cookie: mohsen } })).status, 403);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Company", entityId: "report", action: "export" } }));
});


/* the archive through 13.1's companies import (0.12): the client's file is one tab per category */
const HEAD = ["اسم الشركة", "الرقم", "اسم المسؤول", "الوظيفة", "الإيميل", "المكان الحالي", "المساحة الحالية", "بداية العقد", "نهاية العقد", "متوسط الإيجار", "الزيادة السنوية %", "الفيدباك"];
async function archive(tabs: Array<[string, unknown[][]]>) {
  const book = new ExcelJS.Workbook();
  for (const [name, rows] of tabs) { const ws = book.addWorksheet(name); ws.addRow(HEAD); rows.forEach((r) => ws.addRow(r)); }
  return new Blob([await book.xlsx.writeBuffer()]);
}
const send = (path: string, file: Blob, cookie: string) => { const f = new FormData(); f.append("file", file, "Companys archive.xlsx"); return fetch(`${API}/imports/${path}`, { method: "POST", body: f, headers: { cookie } }); };
const row = (n: string, extra: Partial<Record<number, unknown>> = {}) => HEAD.map((_, i) => extra[i] ?? (i === 0 ? `${NAME} ${n}` : i === 8 ? "2027-01-15" : i === 9 ? "45,000" : i === 10 ? "10" : ""));

test("the archive: each tab's name is its rows' category; errors name the tab and the line; names already there are duplicates", async () => {
  const file = await archive([[cats[2]!, [row("أ"), row("ب", { 8: "مش تاريخ" })]], [cats[3]!, [row("ج"), row("قريب", { 1: null })]]]);
  const p = await (await send("companies/preview", file, hadeer)).json();
  assert.equal(p.total, 4);
  assert.ok(p.errors.length && p.errors.every((e: { line: number; column: string }) => e.line === 3 && e.column === `${cats[2]} · نهاية العقد`), JSON.stringify(p.errors));
  const r = await send("companies", file, hadeer);
  assert.equal(r.status, 200);
  const done = await r.json();
  assert.equal(done.imported, 2); // أ and ج; ب has an error, «قريب» (no number) was seeded with no number: a duplicate
  assert.equal(done.duplicates, 1);
  const a = await prisma.company.findFirstOrThrow({ where: { name: `${NAME} أ` } });
  assert.deepEqual([a.category, a.contractEnd?.toISOString().slice(0, 10), a.averageRent?.toFixed(2), a.annualEscalation?.toFixed(2)], [cats[2], "2027-01-15", "45000.00", "10.00"]);
  assert.equal((await prisma.company.findFirstOrThrow({ where: { name: `${NAME} ج` } })).category, cats[3]);
  // the report sees the imported contract the moment it's in
  assert.equal(await prisma.company.count({ where: { name: `${NAME} ب` } }), 0);
});

test("a one-tab sheet with the category column still works as 13.1's template; a sales account gets 403", async () => {
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Sheet1");
  ws.addRow(["اسم الشركة", "الكاتيجوري", ...HEAD.slice(1)]);
  ws.addRow([`${NAME} د`, cats[4], ...row("د").slice(1)]);
  ws.addRow([`${NAME} ه`, "", ...row("ه").slice(1)]); // the column is there but empty: an error, not «Sheet1»
  const file = new Blob([await book.xlsx.writeBuffer()]);
  const p = await (await send("companies/preview", file, hadeer)).json();
  assert.deepEqual([p.valid, p.errors.length], [1, 1]);
  assert.equal((await send("companies/preview", file, mohsen)).status, 403);
  await send("companies", file, hadeer);
  assert.equal((await prisma.company.findFirstOrThrow({ where: { name: `${NAME} د` } })).category, cats[4]);
});

test("the archive's tab must be a category of the list (any case → the list's spelling); Operations can't import into Telesales' sheet", async () => {
  const file = await archive([[cats[5]!.toUpperCase(), [row("و")]], ["مش كاتيجوري", [row("ز")]]]);
  const p = await (await send("companies/preview", file, hadeer)).json();
  assert.equal(p.valid, 1);
  assert.ok(p.errors.some((e: { message: string }) => e.message.includes("«مش كاتيجوري» مش في قايمة الكاتيجوريز")), JSON.stringify(p.errors));
  assert.equal((await send("companies/preview", file, heba)).status, 403); // «leads: import», but adding to the sheet is Telesales'
  assert.equal((await send("companies", file, heba)).status, 403);
  assert.equal((await (await send("companies", file, hadeer)).json()).imported, 1);
  assert.equal((await prisma.company.findFirstOrThrow({ where: { name: `${NAME} و` } })).category, cats[5]);
  assert.equal(await prisma.company.count({ where: { name: `${NAME} ز` } }), 0);
});

test("«leads: export» alone (the ops head) doesn't open the sheet through its Excel", async () => {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "opshead" } });
  const email = `companies-export-${stamp}@places.test`;
  const user = await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: { roleId: role.id, primary: true } } } });
  try {
    const head = await session(email);
    assert.equal((await call("/companies", { cookie: head })).status, 403);
    assert.equal((await fetch(`${API}/companies/export`, { headers: { cookie: head } })).status, 403);
  } finally {
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: user.id }, { entityId: user.id }] } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
