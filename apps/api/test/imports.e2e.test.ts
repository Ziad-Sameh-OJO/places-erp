/**
 * 13.1 · old data from the fixed templates against the real API and database: the template downloads, the preview
 * counts new / duplicate / error rows and saves nothing, «تأكيد» saves only the new rows (audited), and the same sheet
 * again adds nothing. Manar (inventory) imports units, the Super Admin leads and companies; sales gets 403 on both.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, session } from "./helpers.ts";

const stamp = String(Date.now()).slice(-8);
const P = `E2E-IMP${stamp}`;
let manar: string, admin: string, sales: string, agent: string;

before(async () => {
  [manar, admin, sales] = await Promise.all(["manar.ahmed@places.com", "ahmed.islam@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  agent = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).name;
});

after(async () => {
  const units = await prisma.unit.findMany({ where: { project: { startsWith: P } }, select: { id: true, ownerId: true } });
  const leads = await prisma.lead.findMany({ where: { name: { startsWith: P } }, select: { id: true, clientId: true } });
  const companies = await prisma.company.findMany({ where: { name: { startsWith: P } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...units, ...leads, ...companies].map((x) => x.id) } } });
  await prisma.unit.deleteMany({ where: { id: { in: units.map((u) => u.id) } } });
  await prisma.lead.deleteMany({ where: { id: { in: leads.map((l) => l.id) } } });
  await prisma.company.deleteMany({ where: { id: { in: companies.map((c) => c.id) } } });
  // the owners' files the units made (M-10 2.11), once nothing else is in them
  const owners = units.flatMap((u) => (u.ownerId ? [u.ownerId] : []));
  const empty = await prisma.client.findMany({ where: { id: { in: owners }, units: { none: {} }, leads: { none: {} } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: empty.map((c) => c.id) } } });
  await prisma.client.deleteMany({ where: { id: { in: empty.map((c) => c.id) } } });
  await prisma.$disconnect();
});

const upload = (path: string, csv: string, cookie: string) => {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "sheet.csv");
  return fetch(`${API}/imports/${path}`, { method: "POST", body: form, headers: { cookie } });
};

test("units: template, preview with a duplicate and an error, confirm adds the new ones once; sales 403", async () => {
  const tpl = await fetch(`${API}/imports/units/template`, { headers: { cookie: manar } });
  assert.equal(tpl.status, 200);
  assert.equal((await fetch(`${API}/imports/units/template`, { headers: { cookie: sales } })).status, 403);

  const head = "Type,Project,Area,المساحة,التشطيب,الدور,رقم المبنى,Parking,الاسم,الرقم,السعر للمتر,سعر الإيجار للمتر (Income),الـ Agent,الصيانة,الـ Commission,طريقة الدفع,Last update";
  const row = (project: string, space: string, phone: string, agentName = agent) =>
    `Rent,${P} ${project},التجمع الخامس,${space},متشطب,2,B4,0,أ. مالك,${phone},"1,100",,${agentName},,,,2025-01-15`;
  const csv = [head, row("Mivida", "95", "1000000101"), row("Mivida", "95", "01000000101"), row("Hub", "120", "01000000102"), row("Bad", "x", "01000000103"), row("Ghost", "80", "01000000104", "مش موجود")].join("\n");

  const p = await (await upload("units/preview", csv, manar)).json();
  assert.equal(p.total, 5);
  assert.equal(p.valid, 2);
  assert.equal(p.duplicates, 1); // line 3 = line 2 (Excel dropped the 0 of the number)
  assert.deepEqual(p.errors.map((e: { line: number }) => e.line).sort(), [5, 6]);
  assert.equal(await prisma.unit.count({ where: { project: { startsWith: P } } }), 0);

  assert.equal((await upload("units", csv, sales)).status, 403);
  assert.deepEqual(await (await upload("units", csv, manar)).json(), { imported: 2, duplicates: 1, skipped: 2, merged: 0 });
  const saved = await prisma.unit.findMany({ where: { project: { startsWith: P } }, orderBy: { space: "asc" } });
  assert.deepEqual(saved.map((u) => [u.space, u.pricePerSqm?.toFixed(2), u.ownerPhone, u.lastOwnerUpdateAt < new Date("2025-01-16")]),
    [[95, "1100.00", "01000000101", true], [120, "1100.00", "01000000102", true]]); // the sheet's «Last update» (Cairo day), not today
  assert.equal(await prisma.auditLog.count({ where: { entity: "Unit", action: "create", entityId: { in: saved.map((u) => u.id) } } }), 2);

  // the same sheet again: everything is a duplicate now
  assert.deepEqual(await (await upload("units", csv, manar)).json(), { imported: 0, duplicates: 3, skipped: 2, merged: 0 });
});

test("old leads: duplicate by any mobile (sheet and database), dated, unassigned; sales 403", async () => {
  const m = (n: number) => `015${String(Number(stamp) + n).padStart(8, "0").slice(-8)}`;
  const head = "الاسم,الموبايل,الشركة,Area,Type,المساحة,البادجت,Channel,التاريخ,ملاحظة";
  const csv = [head,
    `${P} أحمد,"${m(1)}، ${m(2)}",,التجمع الخامس,Rent,120,"50,000",Facebook,2025-03-01,عميل قديم`,
    `${P} أحمد تاني,${m(2)},,التجمع الخامس,Rent,,,Facebook,,`,
    `${P} منى,${m(3)},,الشيخ زايد,Resale,,,Instagram,,`,
    `${P} غلط,0123,,الشيخ زايد,Resale,,,Instagram,,`,
  ].join("\n");
  assert.equal((await upload("leads/preview", csv, sales)).status, 403);
  const p = await (await upload("leads/preview", csv, admin)).json();
  assert.deepEqual([p.total, p.valid, p.duplicates, p.errors.length, p.errors[0].line], [4, 2, 1, 1, 5]);

  assert.deepEqual(await (await upload("leads", csv, admin)).json(), { imported: 2, duplicates: 1, skipped: 1 });
  const saved = await prisma.lead.findMany({ where: { name: { startsWith: P } }, orderBy: { name: "asc" } });
  assert.deepEqual(saved.map((l) => [l.phones, l.stage, l.assignedToId]), [[[m(1), m(2)], "FRESH", null], [[m(3)], "FRESH", null]]);
  assert.equal(saved[0]!.createdAt.toISOString().slice(0, 10), "2025-03-01");
  assert.equal(saved[0]!.budget?.toFixed(2), "50000.00");
  assert.equal(await prisma.auditLog.count({ where: { entity: "Lead", action: "import", entityId: { in: saved.map((l) => l.id) } } }), 2);
  assert.deepEqual(await (await upload("leads", csv, admin)).json(), { imported: 0, duplicates: 3, skipped: 1 });
});

test("companies: duplicate by name (any case) and number; sales 403", async () => {
  const head = "اسم الشركة,الكاتيجوري,الرقم,اسم المسؤول,الوظيفة,الإيميل,المكان الحالي,المساحة الحالية,بداية العقد,نهاية العقد,متوسط الإيجار,الزيادة السنوية %,الفيدباك";
  const csv = [head,
    `${P} Acme,IT,0222,أ. سامي,CEO,sami@example.com,المعادي,300,2024-01-01,2027-01-01,"200,000",10,`,
    `${P} ACME,IT,0222,,,,,,,,,,`,
    `${P} Acme,IT,0333,,,,,,,,,,`,
    `${P} NoCat,,,,,,,,,,,,`,
  ].join("\n");
  assert.equal((await upload("companies", csv, sales)).status, 403);
  const p = await (await upload("companies/preview", csv, admin)).json();
  assert.deepEqual([p.valid, p.duplicates, p.errors.length], [2, 1, 1]);
  assert.deepEqual(await (await upload("companies", csv, admin)).json(), { imported: 2, duplicates: 1, skipped: 1 });
  const acme = await prisma.company.findFirstOrThrow({ where: { name: `${P} Acme`, number: "0222" } });
  assert.deepEqual([acme.currentSpace, acme.averageRent?.toFixed(2), acme.contractEnd?.toISOString().slice(0, 10)], [300, "200000.00", "2027-01-01"]);
  assert.deepEqual(await (await upload("companies", csv, admin)).json(), { imported: 0, duplicates: 3, skipped: 1 });
});
