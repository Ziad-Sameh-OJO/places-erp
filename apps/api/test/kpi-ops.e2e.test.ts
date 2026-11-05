/**
 * M-12 · 11.15 Operations' card: «توزيع الليد المؤهل خلال 30 دقيقة» (New Lead requests, 1.17) and «سحب الليدز المخالفة»
 * (Draft / Draft Admin decisions in 24 hours, 1.26 · 1.27). Rows are written straight to the tables those tasks fill;
 * the job writes only Heba's card (`only`) and her items are put back in `after`. Other files add requests and Draft
 * rows at the same time, so the checks look for this file's leads in the line under the item, not at exact numbers.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { isWorkingDay, localDate } from "@places/domain";
import { kpiRefreshTick } from "../../worker/src/processors/kpi-refresh.ts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E ${stamp} K15`;
const MIN = 60_000, HOUR = 60 * MIN;
const ago = (ms: number) => new Date(Date.now() - ms);
let heba = { id: "", userId: "" }, other = "";
let cHeba: string, cSales: string, cardId = "";
let before_: Array<{ id: string; value: unknown }> = [];

let n = 0;
// `draft` set keeps them off the leads list and board, whose counts leads.e2e compares while this file runs
const lead = async (extra: object) => (await prisma.lead.create({ data: {
  code: `L-K${stamp}${++n}`, name: `${NAME} ${n}`, phones: [`0105${stamp.slice(-7)}${n}`], area: `E2E K15 ${stamp}`, type: "Rent", channel: "Facebook",
  createdById: "e2e", stage: "INTERESTED", draft: "draft", ...extra,
} })).id;

before(async () => {
  heba = await prisma.employee.findFirstOrThrow({ where: { user: { email: "heba.salah@places.com" } }, select: { id: true, userId: true } });
  other = (await prisma.user.findFirstOrThrow({ where: { email: "nancy.islam@places.com" }, select: { id: true } })).id;
  [cHeba, cSales] = await Promise.all([session("heba.salah@places.com"), session("salah.eldin@places.com")]);
  const card = await prisma.kpiCard.findFirstOrThrow({ where: { quarter: "2026-Q4", employeeId: heba.id }, select: { id: true, items: { select: { id: true, value: true } } } });
  cardId = card.id;
  before_ = card.items;
  // New Lead: in time (10 min) · late (45 min) · waiting past 30 min · waiting 5 min (not counted) · routed by someone else (not hers)
  await lead({ newLeadRequestedAt: ago(2 * HOUR), newLeadRoutedAt: ago(2 * HOUR - 10 * MIN), newLeadRoutedById: heba.userId });
  await lead({ newLeadRequestedAt: ago(3 * HOUR), newLeadRoutedAt: ago(3 * HOUR - 45 * MIN), newLeadRoutedById: heba.userId });
  await lead({ newLeadRequestedAt: ago(2 * HOUR) });
  await lead({ newLeadRequestedAt: ago(5 * MIN) });
  await lead({ newLeadRequestedAt: ago(4 * HOUR), newLeadRoutedAt: ago(3 * HOUR), newLeadRoutedById: other });
  // Draft: kept after 10 h · Draft Admin waiting 30 h · Draft waiting 2 h (not counted)
  const d = async (kind: string, at: Date, keptAt: Date | null = null) => prisma.leadDraft.create({ data: { leadId: await lead({ draft: kind }), kind, at, keptAt, stage: "INTERESTED" } });
  await d("draft", ago(30 * HOUR), ago(20 * HOUR));
  await d("admin", ago(30 * HOUR));
  await d("draft", ago(2 * HOUR));
});

after(async () => {
  for (const it of before_) await prisma.kpiItem.update({ where: { id: it.id }, data: { value: it.value as never } });
  await prisma.auditLog.deleteMany({ where: { module: "kpis", entity: "KpiItem", action: "refresh", at: { gte: new Date(Number(stamp)) } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-K${stamp}` } } });
  await prisma.$disconnect();
});

test("11.15 · New Lead within 30 minutes and Draft decisions within 24 hours on Operations' card", async () => {
  const now = new Date();
  if (isWorkingDay(localDate(now))) {
    await kpiRefreshTick(now, [heba.id]);
    const items = await prisma.kpiItem.findMany({ where: { cardId, metric: { in: ["newLeadRoute", "draftAction"] } }, select: { value: true } });
    for (const it of items) assert.ok(it.value != null && Number(it.value) < 100, "the late ones pull both items under 100%");
  }

  const res = await call(`/kpis/cards/${cardId}`, { cookie: cHeba });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const detail = (m: string) => res.body.items.find((x: { metric: string }) => x.metric === m).detail as string;
  const nl = detail("newLeadRoute");
  assert.match(nl, /^\d+ في الميعاد من \d+ · اتأخرت في: /);
  assert.ok(nl.includes(`${NAME} 2 (45 د)`), nl);
  assert.ok(nl.includes(`${NAME} 3 (120 د، لسه مستني)`), nl);
  for (const x of [1, 4, 5]) assert.ok(!nl.includes(`${NAME} ${x} (`), `${x}: in time, still in time, or routed by someone else`);
  const dr = detail("draftAction");
  assert.ok(dr.includes(`${NAME} 7 (Draft Admin · 30 س، لسه مستني)`), dr);
  for (const x of [6, 8]) assert.ok(!dr.includes(`${NAME} ${x} (`), `${x}: decided in time, or still in time`);
  assert.equal(res.body.items.find((x: { metric: string | null }) => x.metric === "att").detail, null);

  // another salesperson can't open Heba's card, so doesn't see the leads' names
  assert.equal((await call(`/kpis/cards/${cardId}`, { cookie: cSales })).status, 404);
  assert.equal((await call(`/kpis/cards/${cardId}`, {})).status, 401);
});
