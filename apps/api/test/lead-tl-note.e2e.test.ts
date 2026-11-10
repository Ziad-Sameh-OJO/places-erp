/**
 * 1.33 · M-01 «الـ Team Leader يقدر يسجّل على ليد معيّن حاجة محتاجينها»: the TL writes a note on his team's lead, the
 * salesperson is told and gets a line in «مهامي النهارده» until they open the lead; the salesperson can't write it.
 * Activity + audit in the same transaction.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import type { LeadDetail, LeadTodayItem } from "@places/contracts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E-TLN ${stamp}`;
let tl: string, sales: string, other: string, leadId: string, salesUserId: string;

before(async () => {
  // a salesperson in a Team Leader's team, both still working here
  const member = await prisma.employee.findFirstOrThrow({
    where: { teamLeader: { user: { status: "ACTIVE", roles: { some: { role: { key: "tl" } } } } }, user: { status: "ACTIVE", roles: { some: { role: { key: "sales" } } } } },
    select: { id: true, userId: true, user: { select: { email: true } }, teamLeader: { select: { user: { select: { email: true } } } } },
  });
  salesUserId = member.userId!;
  [tl, sales, other] = await Promise.all([member.teamLeader!.user!.email, member.user!.email, "heba.salah@places.com"].map((e) => session(e)));
  leadId = (await prisma.lead.create({ data: { code: `L-E2ETLN${stamp}`, name: NAME, phones: [], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    createdById: "e2e", assignedToId: member.id, assignedAt: new Date() } })).id;
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: leadId } });
  await prisma.notification.deleteMany({ where: { text: { contains: NAME } } });
  await prisma.lead.deleteMany({ where: { id: leadId } });
  await prisma.$disconnect();
});

const write = (cookie: string, note: string) => call(`/leads/${leadId}/tl-note`, { method: "PUT", cookie, body: { note } });
const board = async (cookie: string) => ((await call("/home/leads", { cookie })).body as LeadTodayItem[]).filter((x) => x.kind === "tlNote" && x.lead?.id === leadId);

test("the salesperson and Operations can't write it; the Team Leader can", async () => {
  assert.equal((await write(sales, "هات عقد الإيجار")).status, 403);
  assert.equal((await write(other, "هات عقد الإيجار")).status, 403);
  const salesView = (await call(`/leads/${leadId}`, { cookie: sales })).body as LeadDetail;
  assert.equal(salesView.canWriteTlNote, false);
  assert.equal(((await call(`/leads/${leadId}`, { cookie: tl })).body as LeadDetail).canWriteTlNote, true);
  assert.equal((await write(tl, "x".repeat(501))).status, 400);
});

test("the TL writes: Activity, audit, the salesperson is told and sees it on «مهامي النهارده» until they open the lead", async () => {
  const r = await write(tl, "هات عقد الإيجار القديم");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body as LeadDetail;
  assert.equal(d.tlNote?.text, "هات عقد الإيجار القديم");
  assert.ok(d.tlNote?.by);
  assert.ok(d.activities.some((a) => a.text === "ملاحظة TL: هات عقد الإيجار القديم"));
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: leadId, action: "tl_note" } });
  assert.deepEqual([audit.module, audit.after], ["leads", { tlNote: "هات عقد الإيجار القديم" }]);
  const told = await prisma.notification.findFirst({ where: { userId: salesUserId, event: "lead.tl_note" }, orderBy: { createdAt: "desc" } });
  assert.equal(told?.text, `الـ Team Leader كتب على ${NAME}: هات عقد الإيجار القديم`);
  assert.equal(told?.link, `/leads?open=${leadId}`);
  // on the salesperson's board, not on the TL's
  assert.equal((await board(sales))[0]?.tlNote, "هات عقد الإيجار القديم");
  assert.equal((await board(tl)).length, 0);
  // the TL opening it doesn't count; the salesperson opening it does
  await call(`/leads/${leadId}`, { cookie: tl });
  assert.equal((await board(sales)).length, 1);
  const seen = (await call(`/leads/${leadId}`, { cookie: sales })).body as LeadDetail;
  assert.equal(seen.tlNote?.text, "هات عقد الإيجار القديم");
  assert.equal((await board(sales)).length, 0);
  // a new note shows again
  assert.equal((await write(tl, "اتصل بيه بكرة")).status, 200);
  assert.equal((await board(sales))[0]?.tlNote, "اتصل بيه بكرة");
});

test("an empty note clears it, without telling anyone", async () => {
  const before = await prisma.notification.count({ where: { userId: salesUserId, event: "lead.tl_note" } });
  const r = await write(tl, "");
  assert.equal(r.status, 200);
  assert.equal((r.body as LeadDetail).tlNote, null);
  assert.equal(await prisma.notification.count({ where: { userId: salesUserId, event: "lead.tl_note" } }), before);
  assert.equal((await board(sales)).length, 0);
});
