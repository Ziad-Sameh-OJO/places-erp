import { test } from "node:test";
import assert from "node:assert/strict";
import { egp, formatEGP } from "../src/money.ts";
import { type DealMoney, awaitsCollection, collectionProblem, payoutDue, payoutProblem, payoutState, collectionStatus, revenueOnCollection, splitDeal, targetAchieved, transactionsOf } from "../src/commission.ts";
import { teamResult, tlAdjustment } from "../src/team-leader.ts";
import { cancelProblem, changes, closedTooSoon, dealCode, dealSides, execState, executeProblem, expectsCommission, papersProblem, reviewProblem, signProblem, takesNote, tcrCode } from "../src/deals.ts";

test("5.12: the TCR code comes from one sequence (T180…), and each salesperson on it signs once", () => {
  assert.equal(tcrCode(181n), "T181");
  const sigs = [{ employeeId: "ahmed", signedAt: null }, { employeeId: "mohamed", signedAt: new Date("2026-11-05T10:00:00Z") }];
  assert.equal(signProblem(sigs, "ahmed"), null);
  assert.equal(signProblem(sigs, "mohamed"), "مضيت عليها قبل كده");
  assert.equal(signProblem(sigs, "ziad"), "الـ TCR دي مش عليك");
  assert.equal(signProblem(sigs, null), "الـ TCR دي مش عليك");
});

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

test("5.8: the TL's balance follows the month's figure; only the difference is booked", () => {
  // 80,000 posted at 4%; the team reaches 70% → 6% of 2,800,000 = 168,000 → 88,000 more
  assert.deepEqual(tlAdjustment(egp(168_000), egp(80_000), "5305", "tl"), [{ accountId: "5305", debit: egp(88_000), credit: 0 }, { accountId: "tl", debit: 0, credit: egp(88_000) }]);
  assert.equal(tlAdjustment(egp(80_000), egp(80_000), "5305", "tl"), null);
  assert.deepEqual(tlAdjustment(egp(70_000), egp(80_000), "5305", "tl"), [{ accountId: "tl", debit: egp(10_000), credit: 0 }, { accountId: "5305", debit: 0, credit: egp(10_000) }]);
});

test("5.4: a Seller counts only once approved; their half then goes to them", () => {
  const scheme = () => 20;
  assert.deepEqual(splitDeal(deal({ sellerApproved: false }), scheme).map((s) => s.side), ["buyer", "buyer"]);
  const seller = splitDeal(deal(), scheme).find((s) => s.side === "seller")!;
  assert.equal(seller.share, egp(50_000));
  assert.equal(seller.commission, egp(10_000));
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

test("5.3 · a collection: approved deals only, above zero, never above what's left; revenue is the whole commission at the first one", () => {
  const none = deal({ payments: [] }), part = deal({ status: "Partially Collected", payments: [{ side: "client", amount: egp(30_000) }] });
  assert.equal(collectionProblem(none, egp(30_000)), null);
  assert.equal(collectionProblem(part, egp(70_000)), null);
  assert.match(collectionProblem(part, egp(70_001))!, /أكبر من الباقي/);
  assert.match(collectionProblem(none, 0)!, /أكبر من صفر/);
  assert.match(collectionProblem(deal({ status: "Fully Collected" }), egp(1))!, /اتوافق عليها/);
  assert.match(collectionProblem(deal({ status: "Pending Review", payments: [] }), egp(1))!, /اتوافق عليها/);
  assert.equal(revenueOnCollection(none), egp(100_000));
  assert.equal(revenueOnCollection(part), 0);
});

test("M-02 · «حصّل عمولة» waits on the accountant from the approval until the deal is fully collected", () => {
  assert.equal(awaitsCollection(deal({ payments: [] })), true);
  assert.equal(awaitsCollection(deal({ status: "Partially Collected", payments: [{ side: "client", amount: egp(30_000) }] })), true);
  assert.equal(awaitsCollection(deal({ status: "Fully Collected" })), false);
  assert.equal(awaitsCollection(deal({ status: "Pending Review", payments: [] })), false);
  assert.equal(awaitsCollection(deal({ status: "Cancelled", payments: [] })), false);
  assert.equal(awaitsCollection(deal({ payments: [], commissionOwner: 0, commissionClient: 0 })), false);
});

test("12 · 9.6: only a deal on the sheet is cancelled, once, with a reason", () => {
  assert.equal(cancelProblem("Fully Collected", "العميل رجع في كلامه"), null);
  assert.equal(cancelProblem("Approved", "x"), null);
  assert.equal(cancelProblem("Cancelled", "x"), "الصفقة دي اتلغت قبل كده");
  assert.equal(cancelProblem("Pending Review", "x"), "الإلغاء بيبقى على صفقة اتوافق عليها");
  assert.equal(cancelProblem("Approved", "  "), "اكتب سبب الإلغاء");
});

test("9.15: commission is payable once fully collected, less what was paid; never above what's due or the 21103 balance", () => {
  const full = deal({ status: "Fully Collected" });
  assert.equal(payoutDue(full, "mohamed", scheme, 0), egp(15_000)); // the client's example: 30% of the Seller's 50,000
  assert.equal(payoutDue(full, "mohamed", scheme, egp(10_000)), egp(5_000));
  assert.equal(payoutDue(full, "mohamed", scheme, egp(15_000)), 0);
  assert.equal(payoutDue(deal({ status: "Partially Collected" }), "mohamed", scheme, 0), 0);
  assert.equal(payoutState(full, egp(5_000)), "مستحقة · اتحصّلت بالكامل");
  assert.equal(payoutState(full, 0), "اتصرفت");
  assert.equal(payoutState(deal({ payments: [] }), 0), "لسه مااتحصّلتش");
  assert.equal(payoutProblem(egp(5_000), egp(20_000), egp(5_000)), null);
  assert.equal(payoutProblem(egp(5_000), egp(20_000), egp(5_001)), `المستحق ${formatEGP(egp(5_000))} بس`);
  assert.equal(payoutProblem(0, egp(20_000), egp(1)), "مفيش عمولة مستحقة هنا");
  assert.equal(payoutProblem(egp(5_000), egp(2_000), egp(5_000)), `رصيد حسابه في العمولات المستحقة ${formatEGP(egp(2_000))} بس`);
  assert.equal(payoutProblem(egp(5_000), egp(20_000), 0), "المبلغ لازم يبقى أكبر من صفر");
});

test("M-02 3.1 · KPI 2202: the execution chip — on time, late, or past its date and not done", () => {
  assert.equal(execState(null, null, "2026-11-06"), null);
  assert.equal(execState("2026-11-10", null, "2026-11-06"), null); // still in time
  assert.equal(execState("2026-11-05", null, "2026-11-06"), "overdue"); // «متأخرة عن ميعاد التنفيذ»
  assert.equal(execState("2026-11-06", "2026-11-06", "2026-11-06"), "on-time"); // the due day itself is on time
  assert.equal(execState("2026-11-05", "2026-11-06", "2026-11-06"), "late"); // «اتنفذت متأخر»
  assert.equal(execState(null, "2026-11-06", "2026-11-06"), "on-time"); // no date set: the demo counts it on time
  assert.equal(executeProblem("Approved", false), null);
  assert.equal(executeProblem("Fully Collected", true), "اتسجّل التنفيذ قبل كده");
  assert.equal(executeProblem("Pending Review", false), "التنفيذ بيتسجّل على صفقة اتوافق عليها بس");
});

test("M-02 3.1: Finance marks the papers «سليمة», or «فيها خطأ» with what's wrong, on a deal on the sheet", () => {
  assert.equal(papersProblem("Approved", true, undefined), null);
  assert.equal(papersProblem("Partially Collected", false, "التفويض ناقص إمضاء"), null);
  assert.equal(papersProblem("Approved", false, "  "), "اكتب الخطأ إيه");
  assert.equal(papersProblem("Cancelled", true, undefined), "مراجعة الأوراق بتبقى على صفقة اتوافق عليها بس");
});
