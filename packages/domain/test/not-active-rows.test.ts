import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyProblem, guessNumberColumn, inventoryMatches, phoneKey } from "../src/not-active.ts";

// M-03 1.1 · 2.3 (voice notes 27/10): Marwa's classification and the comparison with the main inventory.

test("M-03 2.3 · Not True without a feedback is refused; with one, and No Answer / Done, it's fine", () => {
  assert.equal(classifyProblem("Not True", ""), "Not True لازم يتكتب جنبه السبب (Feedback)");
  assert.equal(classifyProblem("Not True", "   "), "Not True لازم يتكتب جنبه السبب (Feedback)");
  assert.equal(classifyProblem("Not True", "مش صاحب الوحدة"), null);
  assert.equal(classifyProblem("No Answer", null), null);
  assert.equal(classifyProblem("Done", undefined), null);
  assert.equal(classifyProblem("Maybe", "x"), "اختار No Answer أو Not True أو Done");
});

test("M-03 1.1 · a number already in the main inventory is found however it's written; the others aren't", () => {
  const units = [{ code: "U-101", ownerPhone: "01012345678" }, { code: "U-102", ownerPhone: "+201099999999" }, { code: "U-103", ownerPhone: null }];
  const rows = [
    { id: "a", number: "+20 101 234 5678" }, { id: "b", number: "0109-999-9999" }, { id: "c", number: "01111111111" }, { id: "d", number: undefined },
  ];
  const m = inventoryMatches(rows, units);
  assert.deepEqual([...m.entries()].map(([r, u]) => [r, u.code]), [["a", "U-101"], ["b", "U-102"]]);
  assert.equal(phoneKey("12"), "");
  assert.equal(phoneKey("01012345678"), "01012345678");
});

test("the sheet's «Number» column, when it's named plainly", () => {
  assert.equal(guessNumberColumn(["رقم الوحدة", "المالك", "الرقم"]), "الرقم");
  assert.equal(guessNumberColumn(["Unit", "Number"]), "Number");
  assert.equal(guessNumberColumn(["رقم الوحدة", "المالك"]), null);
});
