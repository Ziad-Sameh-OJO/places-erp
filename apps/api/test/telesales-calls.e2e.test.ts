/**
 * M-01 · Telesales' daily calls (client, 11 Nov): Hadeer writes her day's total; the KPI «عدد المكالمات اليومية» takes
 * the larger of it and the calls on leads, and a day she entered a «By Telesales» lead counts as a full 100.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { PLACES_CALENDAR, TELESALES_CHANNEL, localDate } from "@places/domain";
import { MEASURES, type Ctx, type Who } from "../../worker/src/processors/kpi-refresh.ts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const HOUR = 60 * 60_000;
let hadeer: string, mohsen: string, hadeerId: string, today: string;

before(async () => {
  [hadeer, mohsen] = await Promise.all(["hadeer.tarek@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  hadeerId = (await prisma.user.findUniqueOrThrow({ where: { email: "hadeer.tarek@places.com" } })).id;
  today = localDate(new Date());
  await prisma.dailyCalls.deleteMany({ where: { userId: hadeerId, day: today } });
});

after(async () => {
  await prisma.dailyCalls.deleteMany({ where: { userId: { in: [hadeerId, `E2E-TC-u${stamp}`] } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-TC${stamp}` } } });
  await prisma.$disconnect();
});

const mine = async () => (await call("/leads/calls/mine", { cookie: hadeer })).body as { count: number; today: { entered: number | null; telesalesLead: boolean; counts: number } };

test("who: Telesales writes her day's calls; sales get 403; not a future day nor older than a week", async () => {
  assert.equal((await call("/leads/calls/daily", { method: "PUT", cookie: mohsen, body: { count: 10 } })).status, 403);
  const tomorrow = localDate(new Date(Date.now() + 26 * HOUR));
  const old = localDate(new Date(Date.now() - 9 * 24 * HOUR));
  assert.equal((await call("/leads/calls/daily", { method: "PUT", cookie: hadeer, body: { count: 10, day: tomorrow } })).status, 400);
  assert.equal((await call("/leads/calls/daily", { method: "PUT", cookie: hadeer, body: { count: 10, day: old } })).status, 400);
  assert.equal((await call("/leads/calls/daily", { method: "PUT", cookie: hadeer, body: { count: -1 } })).status, 400);
});

test("today: what she wrote counts (the larger of it and the logged); a «By Telesales» lead makes the day a full 100", async () => {
  const before = await mine();
  const r = await call("/leads/calls/daily", { method: "PUT", cookie: hadeer, body: { count: 60 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.today.entered, 60);
  if (!before.today.telesalesLead) assert.equal(r.body.today.counts, Math.max(60, before.count));
  await prisma.lead.create({ data: { code: `L-TC${stamp}1`, name: `E2E-TC ${stamp}`, phones: [`0109${stamp.slice(-7)}`], area: "E2E", type: "Rent", channel: TELESALES_CHANNEL, createdById: hadeerId, ownedByTelesales: true } });
  const after = await mine();
  assert.equal(after.today.telesalesLead, true);
  assert.equal(after.today.counts, Math.max(100, after.count, 60)); // a full day
  assert.equal(await prisma.auditLog.count({ where: { entity: "DailyCalls", userId: hadeerId, at: { gte: new Date(Date.now() - HOUR) } } }) >= 1, true);
});

test("the KPI (worker): each day the larger of written / logged, a «By Telesales» day = 100, over the working days", async () => {
  const now = new Date();
  const c: Ctx = { now, quarter: "2026-Q4", qStart: new Date(now.getTime() - 30 * 24 * HOUR), cal: PLACES_CALENDAR };
  const w: Who = { id: `E2E-TC-e${stamp}`, userId: `E2E-TC-u${stamp}`, target: null as never };
  const from = new Date(now.getTime() - 2 * HOUR); // one working day
  const measure = () => MEASURES.callsDaily!(c, { per: "quarter" }, from, w);
  assert.equal(await measure(), 0);
  await prisma.dailyCalls.create({ data: { userId: w.userId, day: localDate(now), count: 70 } });
  assert.equal(await measure(), 70);
  await prisma.lead.create({ data: { code: `L-TC${stamp}2`, name: `E2E-TC ${stamp}`, phones: [`0108${stamp.slice(-7)}`], area: "E2E", type: "Rent", channel: TELESALES_CHANNEL, createdById: w.userId, ownedByTelesales: true, createdAt: new Date(now.getTime() - HOUR) } });
  assert.equal(await measure(), 100);
  await prisma.dailyCalls.update({ where: { userId_day: { userId: w.userId, day: localDate(now) } }, data: { count: 130 } });
  assert.equal(await measure(), 130); // over 100 keeps its number
});
