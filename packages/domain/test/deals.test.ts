import { test } from "node:test";
import assert from "node:assert/strict";
import { egp } from "../src/money.ts";
import { type DealMoney, collectionStatus, splitDeal, targetAchieved, transactionsOf } from "../src/commission.ts";
import { teamResult } from "../src/team-leader.ts";
import { changes, closedTooSoon, dealCode, dealSides, expectsCommission, reviewProblem, takesNote } from "../src/deals.ts";

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

// ── registering and reviewing a Done Deal (M-02 2.1 · Q9) ──

test("«حد معاك في الديل Buyer؟»: the closer plus the others on the Buyer side; the unit's agent is the Seller", () => {
  assert.deepEqual(dealSides("ahmed", ["ziad"], "mohamed"), { buyers: ["ahmed", "ziad"], sellers: ["mohamed"] });
  assert.deepEqual(dealSides("ahmed", ["ahmed"], null), { buyers: ["ahmed"], sellers: [] }); // no agent, no Seller; no duplicate buyer
  assert.deepEqual(dealSides("ahmed", [], "ahmed"), { buyers: ["ahmed"], sellers: [] }); // the closer brought the unit himself
});

test("a deal expects some commission from the Owner or the Client", () => {
  assert.equal(expectsCommission(egp(50_000), 0), true);
  assert.equal(expectsCommission(0, 0), false);
  assert.equal(expectsCommission(egp(-1), egp(10)), false);
  assert.equal(dealCode(301n), "D-301");
});

test("Q9: the Office Manager reviews once; a rejection needs its reason", () => {
  assert.equal(reviewProblem("Pending Review", "approve", undefined), null);
  assert.equal(reviewProblem("Pending Review", "reject", "  "), "اكتبي سبب الرفض");
  assert.equal(reviewProblem("Pending Review", "reject", "المساحة غلط"), null);
  assert.equal(reviewProblem("Approved", "approve", undefined), "الصفقة دي اتراجعت قبل كده");
  assert.equal(reviewProblem("Rejected", "reject", "تاني"), "الصفقة دي اتراجعت قبل كده");
});

test("5.2: only the amounts and fields that changed are audited, old next to new", () => {
  const before = { space: 400, commissionOwner: "50000.00", commissionClient: "0.00", type: "Rent" };
  assert.deepEqual(changes(before, { space: 400, commissionOwner: "45000.00", type: undefined }), { before: { commissionOwner: "50000.00" }, after: { commissionOwner: "45000.00" } });
  assert.equal(changes(before, { space: 400 }), null);
});

test("Q13 · 5.6: created today and closed tomorrow (within 24 hours) → Alarm, out of the target", () => {
  const created = new Date("2026-11-04T15:00:00Z");
  assert.equal(closedTooSoon(created, new Date("2026-11-05T10:00:00Z"), 24), true); // the next day, 19 hours later
  assert.equal(closedTooSoon(created, new Date("2026-11-05T15:00:00Z"), 24), true); // exactly 24 hours
  assert.equal(closedTooSoon(created, new Date("2026-11-05T15:01:00Z"), 24), false);
  assert.equal(closedTooSoon(created, new Date("2026-11-05T10:00:00Z"), 12), false); // the admin set 12 hours in the lead rules
});

test("the note goes on a deal that is on the sheet only", () => {
  assert.equal(takesNote("Approved"), true);
  assert.equal(takesNote("Fully Collected"), true);
  assert.equal(takesNote("Pending Review"), false);
  assert.equal(takesNote("Cancelled"), false);
});
