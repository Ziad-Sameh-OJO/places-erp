import { test } from "node:test";
import assert from "node:assert/strict";
import { monthsBetween, promotionCheck, type PromotionRule } from "../src/career.ts";

// the sample rule: Junior → Senior after 2 quarters with KPIs ≥ 85% and target ≥ 100%
const RULE: PromotionRule = { quarters: 2, minKpi: 85, minTarget: 100, minMonths: null };
const q = (quarter: string, kpi: number | null, target: number | null) => ({ quarter, kpi, target });

test("two good quarters in a row → «مستحق ترقية»", () => {
  const r = promotionCheck(RULE, [q("2026-Q3", 90, 110), q("2026-Q2", 85, 100)], 0);
  assert.equal(r.status, "due");
  assert.deepEqual([r.kpi, r.target, r.months, r.streak], [true, true, null, 2]);
});

test("only the last N closed quarters count, latest first", () => {
  const r = promotionCheck(RULE, [q("2026-Q3", 90, 110), q("2026-Q2", 90, 120), q("2026-Q1", 10, 0)], 0);
  assert.equal(r.status, "due");
  assert.deepEqual(r.quarters.map((x) => x.quarter), ["2026-Q3", "2026-Q2"]);
});

test("one quarter left: the latest is good, the one before isn't → «قريب»", () => {
  const r = promotionCheck(RULE, [q("2026-Q3", 90, 110), q("2026-Q2", 70, 60)], 0);
  assert.equal(r.status, "near");
  assert.equal(r.streak, 1);
  assert.equal(r.quarters[1]!.kpiOk, false);
});

test("one condition left: KPIs fine both quarters, target short → «قريب»", () => {
  const r = promotionCheck(RULE, [q("2026-Q3", 90, 80), q("2026-Q2", 90, 99)], 0);
  assert.equal(r.status, "near");
  assert.deepEqual([r.kpi, r.target], [true, false]);
});

test("both conditions short in the latest quarter → not yet", () => {
  assert.equal(promotionCheck(RULE, [q("2026-Q3", 50, 40), q("2026-Q2", 90, 110)], 0).status, "notYet");
});

test("no target → the target check is skipped («مالوش تارجت»)", () => {
  const r = promotionCheck(RULE, [q("2026-Q3", 88, null), q("2026-Q2", 86, null)], 0);
  assert.equal(r.target, null);
  assert.equal(r.status, "due");
  assert.equal(r.quarters[0]!.targetOk, null);
});

test("no KPI card in a quarter counts as not met; fewer closed quarters than needed isn't enough", () => {
  assert.equal(promotionCheck(RULE, [q("2026-Q3", 90, 110), q("2026-Q2", null, 110)], 0).kpi, false);
  const one = promotionCheck(RULE, [q("2026-Q3", 90, 110)], 0);
  assert.deepEqual([one.kpi, one.target, one.status], [false, false, "near"]);
  assert.equal(promotionCheck(RULE, [], 0).status, "notYet");
});

test("minimum months in the level", () => {
  const rule = { ...RULE, minMonths: 6 };
  const good = [q("2026-Q3", 90, 110), q("2026-Q2", 90, 110)];
  assert.equal(promotionCheck(rule, good, 6).status, "due");
  const short = promotionCheck(rule, good, 5);
  assert.deepEqual([short.months, short.status], [false, "near"]);
  // a quarter short and the months short: two things left
  assert.equal(promotionCheck(rule, [q("2026-Q3", 90, 110), q("2026-Q2", 50, 110)], 5).status, "notYet");
});

test("whole months between two days", () => {
  assert.equal(monthsBetween("2026-01-15", "2026-07-14"), 5);
  assert.equal(monthsBetween("2026-01-15", "2026-07-15"), 6);
  assert.equal(monthsBetween("2026-11-15", "2026-11-01"), 0);
});
