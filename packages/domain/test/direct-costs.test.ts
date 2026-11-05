import { test } from "node:test";
import assert from "node:assert/strict";
import { egp } from "../src/money.ts";
import { campaignShare, directCostLines, directCosts } from "../src/commission.ts";

const acc = { opsExpense: "5303", opsDue: "21104", extExpense: "5304", extDue: "211xx" };

test("9.6: a 100,000 commission at the demo's rates (5% · 0) books 5,000 operations and no external line", () => {
  const c = directCosts(egp(100_000), { opsPct: 5, externalPct: 0 }, null);
  assert.deepEqual(c, { ops: egp(5_000), external: 0 });
  assert.deepEqual(directCostLines(c, acc), [{ accountId: "5303", debit: egp(5_000), credit: 0 }, { accountId: "21104", debit: 0, credit: egp(5_000) }]);
});

test("9.6: the amount written on the review wins over the external %; nothing to book → null", () => {
  assert.deepEqual(directCosts(egp(100_000), { opsPct: 5, externalPct: 2 }, egp(7_500)), { ops: egp(5_000), external: egp(7_500) });
  assert.equal(directCosts(egp(100_000), { opsPct: 5, externalPct: 2 }, null).external, egp(2_000));
  assert.equal(directCostLines({ ops: 0, external: 0 }, acc), null);
});

test("Q40: a 30,000 campaign with 12 Qualified leads costs each deal 2,500; none Qualified yet → the whole spend", () => {
  assert.equal(campaignShare(egp(30_000), 12), egp(2_500));
  assert.equal(campaignShare(egp(30_000), 0), egp(30_000));
});
