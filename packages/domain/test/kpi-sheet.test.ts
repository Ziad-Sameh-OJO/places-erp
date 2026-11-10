import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SHEET_FIELDS, SHEET_FIELD_KEYS, bonusFor, quarterMonths, sheetFigures } from "../src/kpi-sheet.ts";
import type { DealRow } from "../src/targets.ts";

const at = (s: string) => new Date(s);
const deal = (over: Partial<DealRow>): DealRow => ({
  status: "Approved", commissionOwner: 0, commissionClient: 0, targetBase: null, offTarget: false, buyers: ["s1"], sellers: [], sellerApproved: true, payments: [], ...over,
});
// the demo's rules (data.js bonuses): 100% → 5,000 · 120% → 10,000
const RULES = [{ minPct: 100, amount: 500_000 }, { minPct: 120, amount: 1_000_000 }];

test("11.18 · the award is the biggest rule reached, never two added up", () => {
  assert.equal(bonusFor(99.9, RULES), 0);
  assert.equal(bonusFor(100, RULES), 500_000);
  assert.equal(bonusFor(130, RULES), 1_000_000);
  assert.equal(bonusFor(150, []), 0);
});

test("11.18 · the sheet's lines and the quarter's months", () => {
  assert.deepEqual(SHEET_FIELD_KEYS, ["salary", "target", "achieved", "scheme", "commission", "transactions", "bonus"]);
  assert.ok(DEFAULT_SHEET_FIELDS.every((k) => SHEET_FIELD_KEYS.includes(k)));
  assert.deepEqual(quarterMonths("2026-Q4"), ["2026-10", "2026-11", "2026-12"]);
  assert.deepEqual(quarterMonths("2027-Q1"), ["2027-01", "2027-02", "2027-03"]);
});

test("11.18 · a quarter: 3.6M achieved of a 3M target is 120% → 10,000; commission is his share × his 30% scheme", () => {
  const q4 = [at("2026-09-30T21:00:00Z"), at("2026-12-31T22:00:00Z")] as const;
  const deals = [
    // 7.2M collected in the quarter, half on his (Buyer) side = 3.6M
    deal({ sellers: ["s2"], payments: [{ side: "owner", amount: 360_000_000, at: at("2026-10-12T10:00:00Z") }, { side: "client", amount: 360_000_000, at: at("2026-12-01T10:00:00Z") }] }),
    // before the quarter: not his Q4
    deal({ payments: [{ side: "owner", amount: 100_000_000, at: at("2026-09-10T10:00:00Z") }] }),
  ];
  const f = sheetFigures("s1", deals, ...q4, 300_000_000, 30, RULES);
  assert.deepEqual(f, { target: 300_000_000, achieved: 360_000_000, percent: 120, commission: 108_000_000, transactions: 1, bonus: 1_000_000 });
  // no target (not a salesperson): no award whatever came in
  assert.equal(sheetFigures("s1", deals, ...q4, 0, 30, RULES).bonus, 0);
});
