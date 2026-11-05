import { test } from "node:test";
import assert from "node:assert/strict";
import { costPerLead, isCampaignLive, qualificationRate } from "../src/campaigns.ts";
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
