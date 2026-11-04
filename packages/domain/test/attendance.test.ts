/** M-05 · per-person deduction tiers. */
import { test } from "node:test";
import assert from "node:assert/strict";

test("per-person tiers: after the 16-minute grace and in order (M-05 3.1, Q33)", async () => {
  const { tiersProblem, DEFAULT_TIERS } = await import("../src/index.ts");
  assert.equal(tiersProblem(DEFAULT_TIERS), null);
  assert.equal(tiersProblem({ quarterFrom: 31, halfFrom: 61, dayFrom: 121 }), null);
  assert.match(tiersProblem({ quarterFrom: 10, halfFrom: 30, dayFrom: 60 })!, /بعد 16/);
  assert.equal(tiersProblem({ quarterFrom: 40, halfFrom: 30, dayFrom: 60 }), "الربع قبل النص، والنص قبل اليوم");
});
