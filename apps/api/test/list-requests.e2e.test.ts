/**
 * 2.32 · «طلبات الـ Lists» (M-12 Marwa 2 · 3) against the real API: a Team Leader asks from the leads page (a «list»
 * ticket opens for the inventory team, 2.19), Marwa sends the open, confirmed units (a unit a month without an update
 * is «مش مؤكدة»: refused until sent anyway, and counted), the ticket is settled and the TL hears; the KPI job then
 * fills Marwa's lists24 / listsClean items. Mahmoud Ali = TL · Marwa = inventory_staff (Inventory) · Mohamed Mohsen =
 * sales (can't ask) · Manar adds the units.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { isWorkingDay, localDate } from "@places/domain";
import { kpiRefreshTick } from "../../worker/src/processors/kpi-refresh.ts";
import { call, kpiQuarterLock, session } from "./helpers.ts";

const START = new Date();
const stamp = String(START.getTime());
const P = `E2E ${stamp} LISTS`;
let tl: string, marwa: string, sales: string, manar: string, tlId: string, marwaEmp: string;
const units: Record<"fresh" | "stale" | "draft", { id: string; code: string }> = {} as never;
let kpiBefore: { id: string; value: unknown }[] = [];
let requestId = "";

before(async () => {
  [tl, marwa, sales, manar] = await Promise.all(["mahmoud.ali@places.com", "marwa.mostafa@places.com", "m.mohsen@places.com", "manar.ahmed@places.com"].map((e) => session(e)));
  tlId = (await prisma.user.findUniqueOrThrow({ where: { email: "mahmoud.ali@places.com" } })).id;
  marwaEmp = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "marwa.mostafa@places.com" } } })).id;
  kpiBefore = await prisma.kpiItem.findMany({ where: { card: { quarter: "2026-Q4", employeeId: marwaEmp } }, select: { id: true, value: true } });
  // U-101 updated this week · U-104 41 days ago (demo data.js) · a draft Manar hasn't confirmed
  for (const [k, project, days, confirmed] of [["fresh", "Mivida", 3, true], ["stale", "Eastown", 41, true], ["draft", "Hyde Park", 1, false]] as const) {
    const r = await call("/inventory/units", { method: "POST", cookie: manar, body: { type: "Rent", project: `${P} ${project}`, area: "التجمع الخامس", space: 120, condition: "متشطب", pricePerSqm: "900" } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    units[k] = r.body as { id: string; code: string };
    await prisma.unit.update({ where: { id: units[k].id }, data: { pdfStatus: confirmed ? "confirmed" : "draft", lastOwnerUpdateAt: new Date(Date.now() - days * 86_400_000) } });
  }
});
after(async () => {
  for (const it of kpiBefore) await prisma.kpiItem.update({ where: { id: it.id }, data: { value: it.value as never } });
  const reqs = await prisma.listRequest.findMany({ where: { text: { startsWith: P } }, select: { id: true, ticketId: true } });
  const tickets = reqs.flatMap((r) => (r.ticketId ? [r.ticketId] : []));
  const ids = Object.values(units).map((u) => u.id);
  // the job's audit line that wrote Marwa's items (kpi-job.e2e runs the job at the same time and checks its own)
  await prisma.auditLog.deleteMany({ where: { OR: [{ entity: "ListRequest", entityId: { in: reqs.map((r) => r.id) } }, { entity: "Unit", entityId: { in: ids } }, ...kpiBefore.map((it) => ({ module: "kpis", entity: "KpiItem", action: "refresh", at: { gte: START }, after: { path: ["items"], array_contains: [{ id: it.id }] } }))] } });
  await prisma.listRequest.deleteMany({ where: { id: { in: reqs.map((r) => r.id) } } });
  await prisma.ticket.deleteMany({ where: { id: { in: tickets } } });
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

const lists = async (cookie: string) => {
  const r = await call("/inventory/list-requests", { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { items: { id: string; text: string; by: { id: string }; ticketCode: string | null; doneAt: string | null; units: string[]; unconfirmed: number }[]; canAsk: boolean; canSend: boolean };
};
const send = (cookie: string, body: object) => call(`/inventory/list-requests/${requestId}/send`, { method: "POST", cookie, body });

test("a TL asks: a «list» ticket opens for the inventory team; sales can't ask", async () => {
  assert.equal((await call("/inventory/list-requests", { method: "POST", cookie: sales, body: { text: `${P} إيجار التجمع` } })).status, 403);
  assert.equal((await call("/inventory/list-requests", { method: "POST", cookie: tl, body: { text: "" } })).status, 400);
  const r = await call("/inventory/list-requests", { method: "POST", cookie: tl, body: { text: `${P} إيجار التجمع 100–150 م متشطب` } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  requestId = (r.body as { id: string }).id;
  const row = await prisma.listRequest.findUniqueOrThrow({ where: { id: requestId } });
  assert.equal(row.requestedBy, tlId);
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: row.ticketId! } });
  assert.deepEqual([ticket.type, ticket.department, ticket.status, ticket.fromUserId], ["list", "Inventory", "Open", tlId]);
  assert.equal(await prisma.auditLog.count({ where: { entity: "ListRequest", entityId: requestId, action: "create" } }), 1);
  assert.ok(await prisma.notification.findFirst({ where: { text: { contains: P }, link: "/inventory?lists=1", userId: (await prisma.user.findUniqueOrThrow({ where: { email: "marwa.mostafa@places.com" } })).id } }), "Marwa is told");

  const mine = await lists(tl);
  assert.deepEqual([mine.canAsk, mine.canSend], [true, false]);
  assert.match(mine.items.find((x) => x.id === requestId)!.ticketCode ?? "", /^TK-\d+$/);
  const team = await lists(marwa);
  assert.deepEqual([team.canAsk, team.canSend], [false, true]);
  assert.ok(team.items.some((x) => x.id === requestId));
  assert.ok(!(await lists(sales)).items.some((x) => x.id === requestId), "sales see only their own");
});

test("Marwa sends the confirmed units: a draft is refused, an unconfirmed one warns, then the ticket is settled", async () => {
  assert.equal((await send(tl, { unitIds: [units.fresh.id] })).status, 403);
  const draft = await send(marwa, { unitIds: [units.fresh.id, units.draft.id] });
  assert.equal(draft.status, 400);
  const warn = await send(marwa, { unitIds: [units.fresh.id, units.stale.id] });
  assert.equal(warn.status, 400);
  assert.match(JSON.stringify(warn.body), new RegExp(`${units.stale.code} مش مؤكدة`));
  assert.equal((await prisma.listRequest.findUniqueOrThrow({ where: { id: requestId } })).doneAt, null);

  assert.equal((await send(marwa, { unitIds: [units.fresh.id, units.stale.id], sendAnyway: true })).status, 204);
  const row = await prisma.listRequest.findUniqueOrThrow({ where: { id: requestId } });
  assert.deepEqual(row.unitCodes, [units.fresh.code, units.stale.code]);
  assert.equal(row.unconfirmed, 1);
  assert.ok(row.doneAt && row.doneById);
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: row.ticketId! }, include: { events: true } });
  assert.equal(ticket.status, "Closed");
  assert.ok(ticket.firstReplyAt, "the SLA stops when the List is sent");
  assert.ok(ticket.events.some((e) => e.kind === "close" && e.text.includes(units.stale.code)));
  assert.equal(await prisma.auditLog.count({ where: { entity: "ListRequest", entityId: requestId, action: "send" } }), 1);
  assert.ok(await prisma.notification.findFirst({ where: { userId: tlId, event: "list.sent", text: { contains: units.fresh.code } } }), "the TL hears");
  assert.equal((await send(marwa, { unitIds: [units.fresh.id], sendAnyway: true })).status, 400); // sent once
  const seen = (await lists(tl)).items.find((x) => x.id === requestId)!;
  assert.deepEqual([seen.units, seen.unconfirmed], [[units.fresh.code, units.stale.code], 1]);
});

test("the KPI job fills Marwa's «Lists خلال 24 ساعة» and «من غير وحدات مش مؤكدة»", async () => {
  let now = new Date();
  while (!isWorkingDay(localDate(now))) now = new Date(now.getTime() + 86_400_000);
  await kpiQuarterLock(() => kpiRefreshTick(now, [marwaEmp])); // the job measures the current quarter: Q4 2026
  const item = (metric: string) => prisma.kpiItem.findFirstOrThrow({ where: { metric, card: { quarter: "2026-Q4", employeeId: marwaEmp } } });
  const in24 = await item("lists24"), clean = await item("listsClean");
  assert.equal(Number(in24.value), 100); // sent within the 24 hours
  assert.equal(Number(clean.value), 0); // the only List had an unconfirmed unit
});
