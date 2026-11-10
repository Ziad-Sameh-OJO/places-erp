import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignBudget, campaignDays, channelTree, costPerLead, countByReason, isCampaignLive, lastSalesAct, leadsByPost, pageNameProblem, qualificationRate } from "../src/campaigns.ts";
import { fromDecimal, toDecimal } from "../src/money.ts";

test("M-04 3.2: qualification rate = Qualified ÷ Total × 100 (campaign «X» 120 leads, 30 Qualified → 25%)", () => {
  assert.equal(qualificationRate(30, 120), 25);
  assert.equal(qualificationRate(1, 3), 33.3);
  assert.equal(qualificationRate(0, 0), null);
});

test("cost of one lead: 20,000 spent on 120 leads → 166.67; no leads → none", () => {
  assert.equal(toDecimal(costPerLead(fromDecimal("20000"), 120)!), "166.67");
  assert.equal(costPerLead(fromDecimal("5000"), 0), null);
});

test("a campaign is running between its first and last day, both included", () => {
  const c = { startsOn: "2026-11-01", endsOn: "2026-11-30" };
  assert.equal(isCampaignLive(c, "2026-11-01"), true);
  assert.equal(isCampaignLive(c, "2026-11-30"), true);
  assert.equal(isCampaignLive(c, "2026-12-01"), false);
});

test("M-04 3.2: Facebook = 320 leads, campaign «X» = 120 and «Y» = 200; Qualified and the rate at both levels; a duplicate counts again (Q22)", () => {
  const arrivals = [
    ...Array.from({ length: 120 }, (_, i) => ({ channel: "Facebook", campaignId: "X", qualified: i < 30, post: i < 10 ? "ريلز المول" : null })),
    ...Array.from({ length: 200 }, (_, i) => ({ channel: "Facebook", campaignId: "Y", qualified: i < 50, post: null })),
    { channel: "Instagram", campaignId: null, qualified: false, post: "ستوري" },
    { channel: "Instagram", campaignId: null, qualified: false, post: "ستوري" }, // the same lead came twice
  ];
  const [fb, ig] = channelTree(arrivals);
  assert.equal(fb!.channel, "Facebook");
  assert.deepEqual([fb!.leads, fb!.qualified, fb!.rate], [320, 80, 25]);
  assert.deepEqual(fb!.campaigns.map((c) => [c.campaignId, c.leads, c.qualified, c.rate]), [["Y", 200, 50, 25], ["X", 120, 30, 25]]);
  assert.equal(fb!.noCampaign, 0);
  assert.deepEqual([ig!.leads, ig!.noCampaign, ig!.rate], [2, 2, 0]);
  assert.deepEqual(leadsByPost(arrivals), [{ post: "ريلز المول", leads: 10 }, { post: "ستوري", leads: 2 }]);
});

test("4.18 · not Qualified: the reason's latest comment by a person, else his latest action; nobody touched it → none", () => {
  const at = (h: number) => new Date(`2026-11-09T${String(h).padStart(2, "0")}:00:00Z`);
  const acts = [
    { kind: "assign", text: "اتوزّع", byUserId: null, at: at(9) },
    { kind: "comment", text: "مش محتاج مكتب دلوقتي", byUserId: "u5", at: at(10) },
    { kind: "stage", text: "Not Interested", byUserId: "u5", at: at(11) },
  ];
  assert.equal(lastSalesAct(acts)?.text, "مش محتاج مكتب دلوقتي");
  assert.equal(lastSalesAct(acts.filter((a) => a.kind !== "comment"))?.text, "Not Interested");
  assert.equal(lastSalesAct([acts[0]!]), null);
  assert.deepEqual(countByReason(["No Answer", "Fresh", "No Answer", "Not Interested", "No Answer"]),
    [{ reason: "No Answer", count: 3 }, { reason: "Fresh", count: 1 }, { reason: "Not Interested", count: 1 }]);
});

test("4.19 · page names: Website · Property Finder · Dubizzle; a name twice (any case) or empty is refused, renaming to itself isn't", () => {
  const names = ["Website", "Property Finder", "Dubizzle"];
  assert.equal(pageNameProblem(names, "Bayut"), null);
  assert.equal(pageNameProblem(names, " website "), "الاسم ده موجود");
  assert.equal(pageNameProblem(names, "  "), "اكتب اسم الصفحة");
  assert.equal(pageNameProblem(names, "Dubizzle", "Dubizzle"), null);
  assert.equal(pageNameProblem(names, "Website", "Dubizzle"), "الاسم ده موجود");
});

test("4.20 · no end date = «مستمرة»; 1,500 per day from 1 Nov is 13,500 by 9 Nov; stopped on the 5th it stays 7,500; an old total stays", () => {
  const c = { startsOn: "2026-11-01", endsOn: null, dailyBudget: fromDecimal("1500"), budget: 0 };
  assert.equal(isCampaignLive(c, "2027-03-01"), true);
  assert.equal(isCampaignLive(c, "2026-10-31"), false);
  assert.equal(campaignDays(c, "2026-11-09"), 9);
  assert.equal(toDecimal(campaignBudget(c, "2026-11-09")), "13500.00");
  const stopped = { ...c, endsOn: "2026-11-05" };
  assert.equal(isCampaignLive(stopped, "2026-11-09"), false);
  assert.equal(toDecimal(campaignBudget(stopped, "2026-11-09")), "7500.00");
  assert.equal(campaignDays({ ...c, startsOn: "2026-11-20" }, "2026-11-09"), 0);
  assert.equal(toDecimal(campaignBudget({ ...c, dailyBudget: null, budget: fromDecimal("20000") }, "2026-11-09")), "20000.00");
});
