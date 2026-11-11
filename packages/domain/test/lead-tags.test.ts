/** M-01 · Tags on a lead (client, 11 Nov): who approves, and what can't be tagged. */
import { test } from "node:test";
import assert from "node:assert/strict";

test("a salesperson's tag waits for his Team Leader", async () => {
  const { tagApprover } = await import("../src/index.ts");
  const sales = { employeeId: "s1", teamLeaderId: "tlA", isTl: false };
  assert.deepEqual(tagApprover(sales, { employeeId: "s2", teamLeaderId: "tlB", isTl: false }), { approverId: "tlA", approved: false });
  assert.deepEqual(tagApprover({ ...sales, teamLeaderId: null }, { employeeId: "s2", teamLeaderId: "tlB", isTl: false }), { approverId: null, approved: false }); // no TL: whoever approves leads
});

test("a Team Leader's tag: his own team at once, another team's waits for its Team Leader", async () => {
  const { tagApprover } = await import("../src/index.ts");
  const tl = { employeeId: "tlA", teamLeaderId: null, isTl: true };
  assert.deepEqual(tagApprover(tl, { employeeId: "s1", teamLeaderId: "tlA", isTl: false }), { approverId: "tlA", approved: true });
  assert.deepEqual(tagApprover(tl, { employeeId: "s9", teamLeaderId: "tlB", isTl: false }), { approverId: "tlB", approved: false });
});

test("not the asker, not the lead's owner, at most 5, at least one", async () => {
  const { tagProblem } = await import("../src/index.ts");
  assert.equal(tagProblem("own", "me", ["s1", "s2"]), null);
  assert.match(tagProblem("own", "me", [])!, /اختار/);
  assert.match(tagProblem("own", "me", ["me"])!, /لنفسك/);
  assert.match(tagProblem("own", "me", ["own"])!, /صاحب الليد/);
  assert.match(tagProblem("own", "me", ["a", "b", "c", "d", "e", "f"])!, /5/);
});
