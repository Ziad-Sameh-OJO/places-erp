/**
 * M-12 · 11.13 Farming / Approach and 11.5 the daily job: a salesperson plans a Farming, says after its time that he
 * did it, his follower hears of it, and the job raises his Farming item. The job writes only this person's card here
 * (`only`), so the other files' cards are untouched. Everything is put back in `after`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { isWorkingDay, localDate } from "@places/domain";
import { kpiRefreshTick } from "../../worker/src/processors/kpi-refresh.ts";
import { call, session } from "./helpers.ts";

const start = new Date();
const PLACE = `E2E-KJ ${Date.now()}`;
const EMAIL = "ibrahim.samir@places.com";
let me: string, other: string;
let emp = { id: "", userId: "" };
let before_: Array<{ id: string; value: unknown }> = [];

const farming = () => prisma.kpiItem.findFirstOrThrow({ where: { metric: "activitiesDone", card: { quarter: "2026-Q4", employeeId: emp.id } } });
/** kpis.e2e closes the quarter and opens the next for a moment; the job measures the current quarter. */
async function q4Current() {
  for (let i = 0; i < 50; i++) {
    const q = await prisma.kpiQuarter.findFirst({ orderBy: { id: "desc" } });
    if (q?.id === "2026-Q4" && q.status === "open") return;
    await new Promise((r) => setTimeout(r, 200));
  }
}
/** A working-day instant at or after now (the job does nothing on Fridays). */
function workingNow() {
  let t = new Date();
  while (!isWorkingDay(localDate(t))) t = new Date(t.getTime() + 24 * 3600_000);
  return t;
}

before(async () => {
  [me, other] = await Promise.all([session(EMAIL), session("m.samy@places.com")]);
  emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: EMAIL } }, select: { id: true, userId: true } });
  before_ = (await prisma.kpiItem.findMany({ where: { card: { quarter: "2026-Q4", employeeId: emp.id } }, select: { id: true, value: true } }));
});

after(async () => {
  for (const it of before_) await prisma.kpiItem.update({ where: { id: it.id }, data: { value: it.value as never } });
  await prisma.salesActivity.deleteMany({ where: { place: { startsWith: "E2E-KJ" } } });
  await prisma.auditLog.deleteMany({ where: { module: "kpis", at: { gte: start }, OR: [{ entity: "SalesActivity" }, { entity: "KpiItem", action: "refresh" }] } });
  await prisma.notification.deleteMany({ where: { text: { contains: PLACE } } });
  await prisma.$disconnect();
});

test("11.13 · Farming: planned → «عملتها؟» after its time → the follower hears → the job raises the item", async () => {
  const mine = await call("/kpis/activities", { cookie: me });
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.equal(mine.body.show, true);
  assert.equal((await call("/kpis/activities", {})).status, 401);

  const soon = new Date(Date.now() + 3600_000).toISOString();
  assert.equal((await call("/kpis/activities", { method: "POST", cookie: me, body: { kind: "Farming", place: "", at: soon } })).status, 400);
  assert.equal((await call("/kpis/activities", { method: "POST", cookie: me, body: { kind: "Farming", place: `${PLACE} later`, at: soon } })).status, 204);
  const later = (await call("/kpis/activities", { cookie: me })).body.items.find((a: { place: string }) => a.place === `${PLACE} later`);
  assert.equal((await call(`/kpis/activities/${later.id}/result`, { method: "POST", cookie: me, body: { done: true } })).status, 400, "not before its time");

  const past = new Date(Date.now() - 3600_000).toISOString();
  assert.equal((await call("/kpis/activities", { method: "POST", cookie: me, body: { kind: "Farming", place: PLACE, at: past } })).status, 204);
  assert.equal((await call("/kpis/activities", { method: "POST", cookie: me, body: { kind: "Approach", place: `${PLACE} co`, at: past } })).status, 204);
  const items = (await call("/kpis/activities", { cookie: me })).body.items as Array<{ id: string; place: string; status: string }>;
  const f = items.find((a) => a.place === PLACE)!, ap = items.find((a) => a.place === `${PLACE} co`)!;
  assert.equal(f.status, "planned");

  // someone else can't answer it, an Approach needs its companies
  assert.equal((await call(`/kpis/activities/${f.id}/result`, { method: "POST", cookie: other, body: { done: true } })).status, 404);
  assert.equal((await call(`/kpis/activities/${ap.id}/result`, { method: "POST", cookie: me, body: { done: true } })).status, 400);
  assert.equal((await call(`/kpis/activities/${ap.id}/result`, { method: "POST", cookie: me, body: { done: false } })).status, 204);

  const done = await call(`/kpis/activities/${f.id}/result`, { method: "POST", cookie: me, body: { done: true, got: true, note: "مبنى جديد" } });
  assert.equal(done.status, 204, JSON.stringify(done.body));
  assert.equal((await call(`/kpis/activities/${f.id}/result`, { method: "POST", cookie: me, body: { done: true } })).status, 409);
  const now = (await call("/kpis/activities", { cookie: me })).body.items as Array<{ id: string; status: string; got: boolean }>;
  assert.deepEqual(now.filter((a) => a.id === f.id || a.id === ap.id).map((a) => a.status).sort(), ["done", "notDone"]);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "SalesActivity", entityId: f.id, action: "update" } }), "audited");
  const card = await prisma.kpiCard.findFirstOrThrow({ where: { quarter: "2026-Q4", employeeId: emp.id }, select: { follower: { select: { userId: true } } } });
  if (card.follower) assert.ok(await prisma.notification.findFirst({ where: { userId: card.follower.userId, text: { contains: PLACE } } }), "the follower hears");

  await q4Current();
  const t = workingNow();
  const was = Number((await farming()).value ?? 0);
  assert.ok((await kpiRefreshTick(t, [emp.id])) >= 1);
  const is = Number((await farming()).value);
  assert.ok(is > was, `the Farming item rose (${was} → ${is})`);
  assert.equal(await kpiRefreshTick(t, [emp.id]), 0, "running twice changes nothing");
  assert.ok(await prisma.auditLog.findFirst({ where: { module: "kpis", entity: "KpiItem", action: "refresh", at: { gte: start } } }));
});

test("11.5 · the job adds nothing on a Friday", async () => {
  let fri = new Date();
  while (new Date(`${localDate(fri)}T12:00:00Z`).getUTCDay() !== 5) fri = new Date(fri.getTime() + 24 * 3600_000);
  assert.equal(await kpiRefreshTick(fri, [emp.id]), 0);
});
