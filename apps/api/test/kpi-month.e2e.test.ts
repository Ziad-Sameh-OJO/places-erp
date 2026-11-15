/**
 * HR 15 Nov · «الربع» / «الشهر»: every card also reads this month — a count item gets a third of its quarter goal and
 * this month's figure (the daily job's), a manual item has no month figure. Same people as the card: Youssef and his
 * follower Mahmoud see it, a colleague doesn't. The item the file changes is put back in `after`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { localDate } from "@places/domain";
import { kpiRefreshTick } from "../../worker/src/processors/kpi-refresh.ts";
import { call, kpiQuarterLock, session, workingNow } from "./helpers.ts";

const start = new Date();
let youssef: string, mahmoud: string, colleague: string;
let card = { id: "", employeeId: "" };
let saved: { id: string; method: string; metric: string | null; params: unknown; goal: unknown; value: unknown; monthValue: unknown; monthOf: string | null } | null = null;

before(async () => {
  [youssef, mahmoud] = await Promise.all(["youssef.safwat@places.com", "mahmoud.ali@places.com"].map((e) => session(e)));
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "youssef.safwat@places.com" } }, select: { id: true, teamLeaderId: true } });
  card = await prisma.kpiCard.findFirstOrThrow({ where: { quarter: "2026-Q4", employeeId: emp.id }, select: { id: true, employeeId: true } });
  // someone on the same team who doesn't follow Youssef's card
  const other = await prisma.employee.findFirstOrThrow({ where: { teamLeaderId: emp.teamLeaderId, id: { not: emp.id }, user: { status: "ACTIVE" } }, select: { user: { select: { email: true } } } });
  colleague = await session(other.user!.email);
});

after(async () => {
  if (saved) {
    const { id, ...data } = saved;
    await prisma.kpiItem.update({ where: { id }, data: data as never });
  }
  await prisma.auditLog.deleteMany({ where: { module: "kpis", entity: "KpiItem", action: "refresh", at: { gte: start } } });
  await prisma.$disconnect();
});

// the card reads «the current quarter»: hold Q4 2026 open for the whole test (kpis.e2e switches it)
test("«الشهر»: 300 calls a quarter → 100 this month, 100 done → 100%; a manual item keeps the quarter's", () => kpiQuarterLock(async () => {
  const month = localDate(new Date()).slice(0, 7);
  const items = await prisma.kpiItem.findMany({ where: { cardId: card.id }, orderBy: { position: "asc" } });
  const it = items.find((x) => x.method !== "report")!;
  saved = { id: it.id, method: it.method, metric: it.metric, params: it.params, goal: it.goal, value: it.value, monthValue: it.monthValue, monthOf: it.monthOf };
  await prisma.kpiItem.update({ where: { id: it.id }, data: { method: "system", metric: "calls", params: {}, goal: 300, value: 100, monthValue: 100, monthOf: month } });

  const r = await call(`/kpis/cards/${card.id}`, { cookie: youssef });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const calls = r.body.items.find((x: { id: string }) => x.id === it.id);
  assert.deepEqual([calls.goal, calls.value, Math.round(calls.achievement)], [300, 100, 33]);
  assert.deepEqual(calls.month, { goal: 100, value: 100, achievement: 100, contribution: it.weight });
  const manual = r.body.items.find((x: { method: string }) => x.method === "manual");
  if (manual) assert.equal(manual.month, null, "no month figure for a manual item");
  assert.ok(r.body.month.score > r.body.score, "the month weighs the same items on this month's figures");

  // a figure of another month doesn't count
  await prisma.kpiItem.update({ where: { id: it.id }, data: { monthOf: "2000-01" } });
  assert.equal((await call(`/kpis/cards/${card.id}`, { cookie: youssef })).body.items.find((x: { id: string }) => x.id === it.id).month.value, null);

  // the board and home carry the month score too; the follower sees the same card, a colleague doesn't
  const board = await call("/kpis/board?scope=me", { cookie: youssef });
  assert.equal(typeof board.body.cards[0].month.score, "number");
  assert.equal(typeof (await call("/home/kpis", { cookie: youssef })).body.mine.month.score, "number");
  assert.equal((await call(`/kpis/cards/${card.id}`, { cookie: mahmoud })).status, 200);
  assert.equal((await call(`/kpis/cards/${card.id}`, { cookie: colleague })).status, 404);
  assert.equal((await call(`/kpis/cards/${card.id}`)).status, 401);

  // the daily job writes this month's figure
  const now = await workingNow();
  await kpiRefreshTick(now, [card.employeeId]);
  const after_ = await prisma.kpiItem.findUniqueOrThrow({ where: { id: it.id } });
  assert.equal(after_.monthOf, localDate(now).slice(0, 7));
  assert.ok(after_.monthValue != null);
}));
