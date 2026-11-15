/**
 * 14.12 · the «سنة + ربع» filter and a past quarter's figures typed by hand, against the real API: the admins and HR type
 * Q4 2025's figures (audited), a salesperson may not; every screen with figures takes `year` + `quarter`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { localDate, quarterBounds, quarterOfDay } from "@places/domain";
import { call, session } from "./helpers.ts";

const start = new Date();
let admin: string, hr: string, sales: string, salesEmp = "";
const Q4_2025 = "year=2025&quarter=4";

before(async () => {
  [admin, hr, sales] = await Promise.all(["ahmed.islam@places.com", "basant.elsawy@places.com", "mahmoud.ali@places.com"].map((e) => session(e)));
  salesEmp = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "mahmoud.ali@places.com" } }, select: { id: true } })).id;
});

after(async () => {
  await prisma.historicalFigure.deleteMany({ where: { createdAt: { gte: start } } });
});

test("14.12 · admin and HR type Q4 2025's figures; they show under that quarter and the change is audited", async () => {
  const saved = await call("/kpis/history", { method: "POST", cookie: admin, body: { year: 2025, quarter: 4, employeeId: salesEmp, kind: "score", value: "88.5", note: "من شيت Q4" } });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const id = (saved.body as { id: string }).id;
  assert.equal((await call("/kpis/history", { method: "POST", cookie: hr, body: { year: 2025, quarter: 4, employeeId: salesEmp, kind: "achieved", value: "150000" } })).status, 201);
  // typing the same figure again replaces it (one per person, kind and quarter)
  assert.equal((await call("/kpis/history", { method: "POST", cookie: admin, body: { year: 2025, quarter: 4, employeeId: salesEmp, kind: "score", value: "91" } })).status, 201);

  const list = await call(`/kpis/history?${Q4_2025}`, { cookie: hr });
  assert.equal(list.status, 200);
  const v = list.body as { label: string; rows: { id: string; employeeId: string; kind: string; value: string }[] };
  assert.equal(v.label, "Q4 2025");
  const mine = v.rows.filter((r) => r.employeeId === salesEmp);
  assert.deepEqual(mine.map((r) => [r.kind, r.value]).sort(), [["achieved", "150000.00"], ["score", "91.00"]]);
  const audits = await prisma.auditLog.findMany({ where: { entity: "HistoricalFigure", entityId: id }, orderBy: { at: "asc" } });
  assert.deepEqual(audits.map((a) => a.action), ["create", "update"]);

  // a quarter that hasn't ended computes its own figures
  const cur = quarterOfDay(localDate(new Date()));
  const live = await call("/kpis/history", { method: "POST", cookie: admin, body: { year: Number(cur.slice(0, 4)), quarter: Number(cur.slice(-1)), employeeId: salesEmp, kind: "score", value: "50" } });
  assert.equal(live.status, 400);
  assert.equal((await call("/kpis/history?year=2025", { cookie: admin })).status, 400);

  assert.equal((await call(`/kpis/history/${id}`, { method: "DELETE", cookie: admin })).status, 204);
  assert.equal((await prisma.auditLog.count({ where: { entity: "HistoricalFigure", entityId: id, action: "delete" } })), 1);
});

test("14.12 · a salesperson may not read or type the hand-typed figures", async () => {
  assert.equal((await call(`/kpis/history?${Q4_2025}`, { cookie: sales })).status, 403);
  assert.equal((await call("/kpis/history", { method: "POST", cookie: sales, body: { year: 2025, quarter: 4, employeeId: salesEmp, kind: "score", value: "100" } })).status, 403);
  assert.equal((await call(`/kpis/history?${Q4_2025}`)).status, 401);
});

test("14.12 · the KPI board reads a past quarter, read only, and the current one stays as it was", async () => {
  const past = await call(`/kpis/board?scope=all&${Q4_2025}`, { cookie: admin });
  assert.equal(past.status, 200, JSON.stringify(past.body));
  assert.deepEqual((past.body as { quarter: unknown }).quarter, { id: "2025-Q4", label: "Q4 2025", status: "closed" });
  const now = await call("/kpis/board?scope=all", { cookie: admin });
  const q = (now.body as { quarter: { id: string }; cards: unknown[] });
  const same = await call(`/kpis/board?scope=all&year=${q.quarter.id.slice(0, 4)}&quarter=${q.quarter.id.slice(-1)}`, { cookie: admin });
  assert.equal((same.body as { cards: unknown[] }).cards.length, q.cards.length);
  assert.equal((await call("/kpis/board?scope=all&year=2025&quarter=5", { cookie: admin })).status, 400);
});

test("14.12 · a past quarter's card stays readable with its result, and nothing changes it", async () => {
  const card = await prisma.kpiCard.create({ data: { quarter: "2025-Q4", employeeId: salesEmp, items: { create: [{ position: 0, title: "e2e 14.12", weight: 100, targetText: "10", method: "manual", goal: 10, value: 8 }] } }, include: { items: true } });
  try {
    const board = await call(`/kpis/board?scope=all&${Q4_2025}`, { cookie: admin });
    const tile = (board.body as { cards: { id: string; score: number }[] }).cards.find((c) => c.id === card.id);
    assert.equal(tile?.score, 80);
    const view = await call(`/kpis/cards/${card.id}`, { cookie: admin });
    assert.equal(view.status, 200, JSON.stringify(view.body));
    assert.equal((view.body as { quarter: { status: string } }).quarter.status, "closed");
    // edits only reach the current quarter's cards
    const edit = await call(`/kpis/cards/${card.id}/items/${card.items[0]!.id}/value`, { method: "PATCH", cookie: admin, body: { value: 1 } });
    assert.equal(edit.status, 404);
    assert.equal(Number((await prisma.kpiItem.findUniqueOrThrow({ where: { id: card.items[0]!.id } })).value), 8);
    assert.equal((await call(`/kpis/cards/${card.id}`, { cookie: sales })).status, 200); // his own card
  } finally {
    await prisma.kpiCard.delete({ where: { id: card.id } });
  }
});

test("14.12 · deals, leads, targets and the income statement take the quarter", async () => {
  const b = quarterBounds("2026-Q4");
  const deals = await call("/deals/sheet?year=2026&quarter=4", { cookie: admin });
  assert.equal(deals.status, 200);
  for (const d of (deals.body as { items: { closedAt: string }[] }).items) assert.ok(new Date(d.closedAt) >= b.from && new Date(d.closedAt) < b.to, d.closedAt);
  assert.equal((await call("/deals/sheet?year=2026&quarter=4", { cookie: sales })).status, 200); // his own deals, as before

  const all = (await call("/leads/summary", { cookie: admin })).body as { total: number };
  const old = await call(`/leads/summary?${Q4_2025}`, { cookie: admin });
  assert.equal(old.status, 200);
  assert.ok((old.body as { total: number }).total <= all.total);

  const targets = await call("/reports/targets?year=2026&quarter=4", { cookie: admin });
  assert.equal(targets.status, 200);
  const t = targets.body as { month: string; label: string; can: { edit: boolean } };
  assert.deepEqual([t.month, t.label, t.can.edit], ["2026-Q4", "Q4 2026", false]);
  assert.equal((await call("/reports/targets?year=2026&quarter=4", { cookie: sales })).status, 403);

  const pnl = await call(`/finance/statements/income?${Q4_2025}`, { cookie: admin });
  assert.equal(pnl.status, 200);
  assert.deepEqual([(pnl.body as { label: string; from: string }).label, (pnl.body as { from: string }).from], ["Q4 2025", "2025-10-01"]);
  assert.equal((await call(`/finance/statements/income?${Q4_2025}`, { cookie: sales })).status, 403);
});
