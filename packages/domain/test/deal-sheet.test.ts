import { test } from "node:test";
import assert from "node:assert/strict";
import { egp } from "../src/money.ts";
import type { DealMoney } from "../src/commission.ts";
import { collectedFrom, revenueBoard } from "../src/deal-sheet.ts";

const deal = (over: Partial<DealMoney> = {}): DealMoney => ({
  status: "Partially Collected", commissionOwner: egp(50_000), commissionClient: egp(50_000),
  payments: [{ side: "owner", amount: egp(50_000) }, { side: "client", amount: egp(50_000) }],
  buyers: ["ahmed", "ziad"], sellers: ["mohamed"], sellerApproved: true, targetBase: null, offTarget: false, ...over,
});

test("5.10: the client's example (100,000 collected, 30% scheme) → 30,000 in salespeople's commissions, nothing left", () => {
  assert.deepEqual(revenueBoard([deal({ status: "Fully Collected" })], () => 30), { expected: egp(100_000), collected: egp(100_000), remaining: 0, commission: egp(30_000), deals: 1 });
});

test("5.10: a deal counts from its first collection; pending, rejected and cancelled ones never do", () => {
  const half = deal({ payments: [{ side: "client", amount: egp(40_000) }] });
  const b = revenueBoard([half, deal({ status: "Approved", payments: [] }), deal({ status: "Cancelled" }), deal({ status: "Pending Review", payments: [] })], () => 10);
  assert.deepEqual(b, { expected: egp(100_000), collected: egp(40_000), remaining: egp(60_000), commission: egp(4_000), deals: 1 });
});

test("the sheet's owner side / client side", () => {
  const d = deal({ payments: [{ side: "owner", amount: egp(10_000) }, { side: "client", amount: egp(5_000) }, { side: "owner", amount: egp(2_500) }] });
  assert.equal(collectedFrom(d, "owner"), egp(12_500));
  assert.equal(collectedFrom(d, "client"), egp(5_000));
});
