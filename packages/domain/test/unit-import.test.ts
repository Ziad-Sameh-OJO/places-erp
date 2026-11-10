import { test } from "node:test";
import assert from "node:assert/strict";
import { UNIT_DUP_DEFAULT, dupKey, findDuplicates, importDecision } from "../src/unit-import.ts";

// 2.38 · the client's Rent sheet (docs/requirements/sources/client-files/2026-11-09): P1901 is 690 m on the first floor of P19.
const P1901 = { code: "U-1901", project: "Mivida Business Park", space: 690, floor: "1", building: "P19", ownerName: "أ. سمير", ownerPhone: "01001234567" };

test("one owner with two different units on the same number is not a repeat by default; it is when Number alone is picked", () => {
  const rows = [
    { line: 2, project: "Mivida Business Park", space: 690, floor: "1", building: "P19", ownerName: "أ. سمير", ownerPhone: "+20 100 123 4567" },
    { line: 3, project: "Mivida Business Park", space: 320, floor: "2", building: "P19", ownerName: "أ. سمير", ownerPhone: "0100-123-4567" },
  ];
  assert.deepEqual(findDuplicates(rows, [P1901], UNIT_DUP_DEFAULT), [{ unit: "U-1901" }, null]);
  assert.deepEqual(findDuplicates(rows, [P1901], ["ownerPhone"]), [{ unit: "U-1901" }, { unit: "U-1901" }]);
  assert.deepEqual(findDuplicates(rows, [], ["ownerPhone"]), [null, { line: 2 }]);
});

test("every picked column must match: text without extra spaces or case, the area by its number", () => {
  const row = { line: 2, project: "  mivida   business park ", space: "690", floor: "1", building: "p19" };
  assert.deepEqual(findDuplicates([row], [P1901], UNIT_DUP_DEFAULT), [{ unit: "U-1901" }]);
  assert.deepEqual(findDuplicates([{ ...row, floor: "2" }], [P1901], UNIT_DUP_DEFAULT), [null]);
  // an empty picked column: nothing to tell it apart by, never a repeat
  assert.equal(dupKey({ ...row, building: "" }, UNIT_DUP_DEFAULT), "");
  assert.deepEqual(findDuplicates([{ ...row, line: 2, building: "" }, { ...row, line: 3, building: "" }], [], UNIT_DUP_DEFAULT), [null, null]);
});

test("the decision: a new row is added, a repeat is left out unless «ضيفها برضه», and merge only for a repeat of a unit", () => {
  assert.equal(importDecision(null, "skip"), "add");
  assert.equal(importDecision({ unit: "U-1901" }, undefined), "skip");
  assert.equal(importDecision({ unit: "U-1901" }, "add"), "add");
  assert.equal(importDecision({ unit: "U-1901" }, "merge"), "merge");
  assert.equal(importDecision({ line: 2 }, "merge"), "skip");
  assert.equal(importDecision({ line: 2 }, "add"), "add");
});
