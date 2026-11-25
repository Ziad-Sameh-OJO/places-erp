/**
 * M-12 · review fixes on the KPI cards against the real API: «سلّم» clicked twice at once hands in once (L10), HR's
 * hidden «salary» stays off the card as on the sheet (S13), «الشيتات في ميعادها» is typed by its follower in the first
 * quarter (L6), and a quarter closed late is measured up to its own end (L5). Everything changed is put back in `after`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { kpiRefreshTick } from "../../worker/src/processors/kpi-refresh.ts";
import { PW, call, kpiQuarterLock, session } from "./helpers.ts";

const stamp = Date.now();
const KEY = `e2e-kpi-review-${stamp}`;
let admin: string, mokhtar: string, nancy: string, hidden: string, roleId = "", userId = "", tempItem = "";
const restore: Array<{ id: string; value: unknown; monthValue: unknown; monthOf: string | null }> = [];

before(async () => {
  [admin, mokhtar, nancy] = await Promise.all(["ahmed.islam@places.com", "mokhtar.gamal@places.com", "nancy.islam@places.com"].map((e) => session(e)));
  // sees the KPI money («kpis: edit») but HR hides the salary from it
  roleId = (await prisma.role.create({ data: { key: KEY, label: `E2E KPI review ${stamp}`, tier: "Executive Staff", scope: "ALL", permissions: { create: [
    { module: "hr", actions: ["view"] }, { module: "kpis", actions: ["view", "edit"] },
  ] } } })).id;
  const email = `kpi-review-${stamp}@places.test`;
  userId = (await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } })).id;
  assert.equal((await call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body: { module: "hr", rules: { salary: "hide" } } })).status, 204);
  hidden = await session(email);
});

after(async () => {
  if (tempItem) await prisma.kpiItem.deleteMany({ where: { id: tempItem } });
  for (const it of restore) await prisma.kpiItem.update({ where: { id: it.id }, data: { value: it.value as never, monthValue: it.monthValue as never, monthOf: it.monthOf } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [roleId, userId, tempItem, ...restore.map((x) => x.id)] } }, { userId }, { module: "kpis", action: "refresh", at: { gte: new Date(stamp) } }] } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.userRole.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.roleFieldRule.deleteMany({ where: { roleId } });
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

test("L10 · «سلّم» twice at once: one hand-in, the item stays at 100%", async () => {
  const card = await prisma.kpiCard.findFirstOrThrow({ where: { quarter: "2026-Q4", employee: { user: { email: "mokhtar.gamal@places.com" } } }, select: { id: true } });
  // its own item (weight 0: the card's score doesn't move), far from the seeded positions
  tempItem = (await prisma.kpiItem.create({ data: { cardId: card.id, position: 900 + (stamp % 90), title: `E2E ${stamp}`, weight: 0, targetText: "1", source: "e2e",
    method: "report", direction: "at-least", goal: 1, required: 1, enteredBy: ["follower"] } })).id;
  const path = `/kpis/cards/${card.id}/items/${tempItem}/deliveries`;
  const body = { link: `https://e2e.test/${stamp}` };
  assert.equal((await call(path, { method: "POST", cookie: nancy, body })).status, 403);
  const both = await Promise.all([call(path, { method: "POST", cookie: mokhtar, body }), call(path, { method: "POST", cookie: mokhtar, body })]);
  assert.deepEqual(both.map((r) => r.status).sort(), [204, 409]);
  assert.equal(await prisma.kpiDelivery.count({ where: { itemId: tempItem } }), 1);
  const it = (await call(`/kpis/cards/${card.id}`, { cookie: mokhtar })).body.items.find((x: { id: string }) => x.id === tempItem);
  assert.deepEqual([it.delivered, it.achievement, it.canDeliver], [1, 100, false]);
});

test("S13 · HR's hidden salary isn't on the card, nor the reward or deduction that gives it away", async () => {
  const cards = (await call("/kpis/board?scope=all", { cookie: hidden })).body as { cards: { id: string }[]; seesMoney: boolean };
  assert.equal(cards.seesMoney, true);
  const id = cards.cards[0]!.id;
  const row = await prisma.kpiCard.findUniqueOrThrow({ where: { id }, select: { payBase: true, payAmount: true } });
  const onSalary = row.payBase === "salary" || row.payAmount == null;
  const mine = (await call(`/kpis/cards/${id}`, { cookie: hidden })).body as { pay: { salary: string | null; delta: string | null } };
  assert.equal(mine.pay.salary, null);
  assert.equal(mine.pay.delta === null, onSalary);
  const theirs = (await call(`/kpis/cards/${id}`, { cookie: admin })).body as { pay: { salary: string | null; delta: string | null } };
  assert.notEqual(theirs.pay.salary, null);
  assert.notEqual(theirs.pay.delta, null);
});

test("L6 · first quarter: «الشيتات في ميعادها» is typed by its follower and the daily job keeps it", async () => {
  await kpiQuarterLock(async () => {
    if (await prisma.kpiQuarter.findUnique({ where: { id: "2026-Q3" } })) return; // only Q4 2026 has no quarter before it
    const it = await prisma.kpiItem.findFirst({ where: { metric: "sheetsOnTime", card: { quarter: "2026-Q4" } },
      select: { id: true, value: true, monthValue: true, monthOf: true, card: { select: { id: true, employeeId: true, follower: { select: { user: { select: { email: true } } } } } } } });
    if (!it) return;
    restore.push(it);
    const follower = await session(it.card.follower?.user.email ?? "ahmed.islam@places.com");
    const view = (await call(`/kpis/cards/${it.card.id}`, { cookie: follower })).body.items.find((x: { id: string }) => x.id === it.id);
    assert.equal(view.canEnter, true);
    const path = `/kpis/cards/${it.card.id}/items/${it.id}/value`;
    assert.equal((await call(path, { method: "PATCH", cookie: hidden, body: { value: 1 } })).status, 403);
    assert.equal((await call(path, { method: "PATCH", cookie: follower, body: { value: 100 } })).status, 204);
    await kpiRefreshTick(new Date("2026-11-24T17:00:00Z"), [it.card.employeeId]); // a Tuesday
    assert.equal(Number((await prisma.kpiItem.findUniqueOrThrow({ where: { id: it.id } })).value), 100);
  });
});

test("L5 · the quarter closed late: the job measures up to its end, the month figure stays December's", async () => {
  await kpiQuarterLock(async () => {
    const q = await prisma.kpiQuarter.findFirst({ orderBy: { id: "desc" } });
    if (q?.id !== "2026-Q4" || q.status !== "open") return;
    const card = await prisma.kpiCard.findFirstOrThrow({ where: { quarter: "2026-Q4", employee: { user: { email: "mokhtar.gamal@places.com" } } },
      select: { employeeId: true, items: { where: { method: "system" }, select: { id: true, value: true, monthValue: true, monthOf: true } } } });
    restore.push(...card.items);
    await kpiRefreshTick(new Date("2027-01-05T17:00:00Z"), [card.employeeId]); // a Tuesday in the next quarter
    const months = (await prisma.kpiItem.findMany({ where: { id: { in: card.items.map((x) => x.id) } }, select: { monthOf: true } })).map((x) => x.monthOf);
    assert.ok(!months.includes("2027-01"), months.join());
  });
});
