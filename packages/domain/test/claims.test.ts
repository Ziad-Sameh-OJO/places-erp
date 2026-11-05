/** 9.17 · the amount in words (the issue: 100,000 → «مائة ألف»), the template words, the claim's states. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { amountInWords, claimStep, fillTemplate, numberWords } from "../src/index.ts";

test("100,000 → «فقط مائة ألف جنيه مصري لا غير» (9.17)", () => {
  assert.equal(amountInWords(100_000_00), "فقط مائة ألف جنيه مصري لا غير");
});

test("Arabic number words: units, tens, thousands, millions", () => {
  assert.equal(numberWords(21), "واحد وعشرون");
  assert.equal(numberWords(3_000), "ثلاثة آلاف");
  assert.equal(numberWords(2_000), "ألفان");
  assert.equal(numberWords(12_500), "اثنا عشر ألف وخمسمائة");
  assert.equal(numberWords(2_500_000), "مليونان وخمسمائة ألف");
  assert.equal(amountInWords(150_50), "فقط مائة وخمسون جنيه مصري وخمسون قرش لا غير");
});

test("template words fill in; an unknown word stays visible", () => {
  assert.equal(fillTemplate("السادة / {الشركة} · {المبلغ} · {غلط}", { الشركة: "شركة س", المبلغ: "100,000 ج.م" }), "السادة / شركة س · 100,000 ج.م · {غلط}");
});

test("the claim's states: requested → issued → approved → einvoice → paid; a rejected one stops", () => {
  assert.deepEqual(claimStep("requested", "issue"), { status: "issued" });
  assert.deepEqual(claimStep("issued", "clientApproved"), { status: "approved" });
  assert.deepEqual(claimStep("approved", "einvoice"), { status: "einvoice" });
  assert.deepEqual(claimStep("einvoice", "collect"), { status: "paid" });
  assert.deepEqual(claimStep("approved", "askReceipt"), { status: "approved" });
  assert.ok("problem" in claimStep("rejected", "issue"));
  assert.ok("problem" in claimStep("requested", "collect"));
});
