import { test } from "node:test";
import assert from "node:assert/strict";
import { egp } from "../src/money.ts";
import { type DealMoney, collectionStatus, splitDeal, targetAchieved, transactionsOf } from "../src/commission.ts";
import { teamResult } from "../src/team-leader.ts";

const deal = (over: Partial<DealMoney> = {}): DealMoney => ({
  status: "Approved", commissionOwner: egp(50_000), commissionClient: egp(50_000),
  payments: [{ side: "owner", amount: egp(50_000) }, { side: "client", amount: egp(50_000) }],
  buyers: ["ahmed", "ziad"], sellers: ["mohamed"], sellerApproved: true, targetBase: null, offTarget: false, ...over,
});
const scheme = () => 30;

test("client example: 100,000 → 25,000 to each of two buyers, 50,000 to the seller, 30% scheme", () => {
  const s = splitDeal(deal(), scheme);
  assert.deepEqual(s.map((x) => [x.salesId, x.share, x.commission]), [
    ["ahmed", egp(25_000), egp(7_500)],
    ["ziad", egp(25_000), egp(7_500)],
    ["mohamed", egp(50_000), egp(15_000)],
  ]);
});

test("the Seller counts only after Manar approves them", () => {
  const s = splitDeal(deal({ sellerApproved: false }), scheme);
  assert.deepEqual(s.map((x) => x.salesId), ["ahmed", "ziad"]);
});

test("the note override changes the target only, never the commission", () => {
  const [ahmed] = splitDeal(deal({ targetBase: egp(60_000) }), scheme);
  assert.equal(ahmed!.targetShare, egp(15_000));
  assert.equal(ahmed!.commission, egp(7_500));
});

test("nothing counts before the first collection; partial and full collection statuses", () => {
  const none = deal({ payments: [] });
  assert.equal(transactionsOf("ahmed", [none]), 0);
  assert.equal(collectionStatus(none), "Approved");
  assert.equal(collectionStatus(deal({ payments: [{ side: "client", amount: egp(10_000) }] })), "Partially Collected");
  assert.equal(collectionStatus(deal()), "Fully Collected");
});

test("cancelled and off-target deals", () => {
  assert.equal(transactionsOf("ahmed", [deal({ status: "Cancelled" })]), 0);
  assert.equal(transactionsOf("ahmed", [deal({ offTarget: true })]), 1); // still a Done Deal…
  assert.equal(targetAchieved("ahmed", [deal({ offTarget: true })], scheme), 0); // …but not in the target
});

test("Team Leader: 4 × 1,000,000 targets = 4,000,000; the tier comes from the team's achievement", () => {
  const tiers = [{ below: 70, percent: 4 }, { below: Infinity, percent: 6 }];
  const m = (achieved: number) => ({ goal: egp(1_000_000), achieved: egp(achieved), shareOfCollections: egp(achieved) });
  const low = teamResult([m(500_000), m(500_000), m(500_000), m(500_000)], tiers);
  assert.equal(low.goal, egp(4_000_000));
  assert.equal(low.tier.percent, 4);
  assert.equal(low.commission, egp(80_000)); // 4% of 2,000,000
  assert.equal(teamResult([m(800_000), m(800_000), m(800_000), m(800_000)], tiers).tier.percent, 6);
});
