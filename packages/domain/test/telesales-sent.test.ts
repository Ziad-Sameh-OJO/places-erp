/** M-01 · Telesales' «اللي بعتيها» (client, 11 Nov). */
import { test } from "node:test";
import assert from "node:assert/strict";

test("«No Answer» is the lead's state now: any other action takes it out", async () => {
  const { sentNoAnswer } = await import("../src/index.ts");
  assert.equal(sentNoAnswer("NO_ANSWER"), true);
  for (const s of ["FRESH", "INTERESTED", "FOLLOW_UP_TO_VISIT", "NOT_INTERESTED", "DONE_DEAL"]) assert.equal(sentNoAnswer(s), false, s);
});

test("a lead she sent: hers, gone to someone else or to Operations — not one she kept or another's", async () => {
  const { isSentByTelesales } = await import("../src/index.ts");
  const me = { userId: "u-hadeer", employeeId: "e-hadeer" };
  assert.equal(isSentByTelesales({ createdById: "u-hadeer", ownedByTelesales: false, assignedToId: "e-sales" }, me), true);
  assert.equal(isSentByTelesales({ createdById: "u-hadeer", ownedByTelesales: false, assignedToId: null }, me), true); // waiting for Operations
  assert.equal(isSentByTelesales({ createdById: "u-hadeer", ownedByTelesales: true, assignedToId: "e-hadeer" }, me), false); // she kept it
  assert.equal(isSentByTelesales({ createdById: "u-hadeer", ownedByTelesales: false, assignedToId: "e-hadeer" }, me), false); // came back to her (rotation 3)
  assert.equal(isSentByTelesales({ createdById: "u-other", ownedByTelesales: false, assignedToId: "e-sales" }, me), false);
});
