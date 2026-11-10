import { test } from "node:test";
import assert from "node:assert/strict";
import { channelTree, costPerLead, isCampaignLive, leadsByPost, pageNameProblem, qualificationRate } from "../src/campaigns.ts";
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

test("4.19 · page names: Website · Property Finder · Dubizzle; a name twice (any case) or empty is refused, renaming to itself isn't", () => {
  const names = ["Website", "Property Finder", "Dubizzle"];
  assert.equal(pageNameProblem(names, "Bayut"), null);
  assert.equal(pageNameProblem(names, " website "), "الاسم ده موجود");
  assert.equal(pageNameProblem(names, "  "), "اكتب اسم الصفحة");
  assert.equal(pageNameProblem(names, "Dubizzle", "Dubizzle"), null);
  assert.equal(pageNameProblem(names, "Website", "Dubizzle"), "الاسم ده موجود");
});
