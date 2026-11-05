/**
 * 1.19 «إدخال جماعي» (M-01 3.2, answers-leads-telesales): Telesales (Hadeer) sends a sheet of mobiles → Operations
 * (Heba) reviews each salesperson's share, takes people out, approves → the new numbers are given in turn; the ones
 * we already have count as a duplicate arrival and don't become leads. Or Operations rejects with a reason.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const START = new Date();
const stamp = String(Date.now());
const num = (n: number) => `0107${stamp.slice(-5)}${String(n).padStart(2, "0")}`;
let hadeer: string, heba: string, mohsen: string, hr: string, hadeerUser: string, hebaUser: string, existingLead: string;
const bulkIds: string[] = [];

before(async () => {
  [hadeer, heba, mohsen, hr] = await Promise.all(["hadeer.tarek@places.com", "heba.salah@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  hadeerUser = (await prisma.user.findUniqueOrThrow({ where: { email: "hadeer.tarek@places.com" } })).id;
  hebaUser = (await prisma.user.findUniqueOrThrow({ where: { email: "heba.salah@places.com" } })).id;
  const mohsenId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  // a lead that already has two of the sheet's numbers (11 and 12)
  existingLead = (await prisma.lead.create({ data: { code: `L-E2EB${stamp}`, name: `E2E-B ${stamp} موجود`, phones: [num(11), num(12)], area: "التجمع الخامس",
    type: "Rent", channel: "Facebook", assignedToId: mohsenId, assignedAt: new Date(), createdById: "e2e" } })).id;
});
after(async () => {
  await prisma.lead.deleteMany({ where: { OR: [{ id: existingLead }, { phones: { hasSome: [...Array(30).keys()].map(num) } }] } });
  await prisma.leadBulk.deleteMany({ where: { id: { in: bulkIds } } });
  await prisma.notification.deleteMany({ where: { createdAt: { gte: START }, OR: [{ text: { contains: "إدخال جماعي" } }, { text: { contains: "الأوبريشن وافقت" } }] } });
  await prisma.$disconnect();
});

const send = (cookie: string, numbers: string, channel = "Facebook") => call("/leads/bulk", { method: "POST", cookie, body: { numbers, channel } });
const pendingOf = async (id: string) => ((await call("/leads/bulk", { cookie: heba })).body as Array<{ id: string; total: number; duplicates: number; fresh: number; people: Array<{ id: string; name: string; onLeave: boolean; excluded: boolean; count: number }> }>).find((b) => b.id === id);

test("who: Telesales sends, a salesperson can't (403); only Operations sees and decides; HR 403", async () => {
  assert.equal((await send(mohsen, num(1))).status, 403);
  assert.equal((await send(hr, num(1))).status, 403);
  assert.equal((await call("/leads/bulk", { cookie: hadeer })).status, 403);
  assert.equal((await call("/leads/bulk/x/decide", { method: "POST", cookie: hadeer, body: { approve: true } })).status, 403);
  assert.equal((await send(hadeer, "مفيش أرقام هنا 0100")).status, 400);
  assert.equal((await send(hadeer, num(1), "")).status, 400);
});

test("a sheet: the mobiles in any cell, written any way, each once (0.12's reader)", async () => {
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("x");
  ws.addRow(["الاسم", "رقم", "ملاحظة"]);
  ws.addRow(["عميل", num(1), "—"]);
  ws.addRow(["عميل", Number(num(2)), `${num(3).slice(0, 4)} ${num(3).slice(4)}`]); // Excel's number cell loses the 0
  ws.addRow(["", num(1), "مكرر"]);
  const form = new FormData();
  form.append("file", new Blob([await book.xlsx.writeBuffer()]), "numbers.xlsx");
  const r = await fetch(`${API}/leads/bulk/sheet`, { method: "POST", body: form, headers: { cookie: hadeer } });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).numbers, [num(1), num(2), num(3)]);
  const form2 = new FormData();
  form2.append("file", new Blob(["x"]), "numbers.xlsx");
  assert.equal((await fetch(`${API}/leads/bulk/sheet`, { method: "POST", body: form2, headers: { cookie: hadeer } })).status, 400);
});

test("10 new numbers on 3 salespeople → 4 / 3 / 3; the 2 we have count as duplicates and don't become leads (the card's e2e)", async () => {
  const text = [...Array(12).keys()].map((i) => num(i + 1)).join("\n");
  const sent = await send(hadeer, text);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  bulkIds.push(sent.body.id);
  assert.deepEqual([sent.body.count, sent.body.duplicates], [12, 2]);
  assert.ok(await prisma.notification.findFirst({ where: { userId: hebaUser, text: { contains: "بعتت إدخال جماعي فيه 12 رقم" }, createdAt: { gte: START } } }));

  let b = (await pendingOf(sent.body.id))!;
  assert.deepEqual([b.total, b.duplicates, b.fresh], [12, 2, 10]);
  const three = b.people.filter((p) => !p.onLeave).slice(0, 3).map((p) => p.id);
  for (const p of b.people.filter((x) => !x.onLeave && !three.includes(x.id))) {
    assert.equal((await call(`/leads/bulk/${sent.body.id}/people/${p.id}`, { method: "PUT", cookie: heba, body: { excluded: true } })).status, 200);
  }
  // the last one can't be taken out
  for (const id of three.slice(0, 2)) await call(`/leads/bulk/${sent.body.id}/people/${id}`, { method: "PUT", cookie: heba, body: { excluded: true } });
  assert.equal((await call(`/leads/bulk/${sent.body.id}/people/${three[2]}`, { method: "PUT", cookie: heba, body: { excluded: true } })).status, 400);
  for (const id of three.slice(0, 2)) await call(`/leads/bulk/${sent.body.id}/people/${id}`, { method: "PUT", cookie: heba, body: { excluded: false } });
  b = (await pendingOf(sent.body.id))!;
  assert.deepEqual(three.map((id) => b.people.find((p) => p.id === id)!.count), [4, 3, 3]);

  const r = await call(`/leads/bulk/${sent.body.id}/decide`, { method: "POST", cookie: heba, body: { approve: true } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { count: 10, people: 3 });
  const made = await prisma.lead.findMany({ where: { phones: { hasSome: [...Array(10).keys()].map((i) => num(i + 1)) } }, include: { activities: true, arrivals: true } });
  assert.equal(made.length, 10);
  assert.deepEqual(three.map((id) => made.filter((l) => l.assignedToId === id).length), [4, 3, 3]);
  assert.ok(made.every((l) => l.stage === "FRESH" && l.assignedAt && l.channel === "Facebook" && /^L-\d+$/.test(l.code)));
  assert.equal(made[0]!.activities[0]!.text, "اتوزع من إدخال جماعي بموافقة الأوبريشن");
  assert.equal(made[0]!.arrivals.length, 1);
  assert.equal(await prisma.lead.count({ where: { phones: { has: num(11) } } }), 1); // still only the old lead
  assert.deepEqual((await prisma.leadArrival.findMany({ where: { leadId: existingLead } })).map((a) => a.duplicate), [true]);

  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "LeadBulk", entityId: sent.body.id, action: "approve" } });
  assert.equal((audit.after as { leads: string[] }).leads.length, 10);
  assert.ok(await prisma.notification.findFirst({ where: { userId: hadeerUser, text: "الأوبريشن وافقت: اتوزع 10 رقم على 3 سيلز", createdAt: { gte: START } } }));
  assert.equal((await call(`/leads/bulk/${sent.body.id}/decide`, { method: "POST", cookie: heba, body: { approve: true } })).status, 409);
  assert.equal(await pendingOf(sent.body.id), undefined);
});

test("rejected with its reason: nothing is created, Telesales is told why; no reason is 400", async () => {
  const sent = await send(hadeer, `${num(20)}\n${num(21)}`);
  bulkIds.push(sent.body.id);
  assert.equal((await call(`/leads/bulk/${sent.body.id}/decide`, { method: "POST", cookie: heba, body: { approve: false } })).status, 400);
  assert.equal((await call(`/leads/bulk/${sent.body.id}/decide`, { method: "POST", cookie: heba, body: { approve: false, reason: "الأرقام دي قديمة" } })).status, 200);
  assert.equal(await prisma.lead.count({ where: { phones: { hasSome: [num(20), num(21)] } } }), 0);
  assert.ok(await prisma.notification.findFirst({ where: { userId: hadeerUser, text: "الأوبريشن رفضت الإدخال الجماعي · السبب: الأرقام دي قديمة" } }));
  assert.equal((await call("/leads/bulk/nope/decide", { method: "POST", cookie: heba, body: { approve: true } })).status, 404);
});
