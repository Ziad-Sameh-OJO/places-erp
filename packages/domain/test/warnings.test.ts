/** M-05 · warnings by HR's rules and the improvement plan under 70% (HR, 15 Nov). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WARNING_RULES, fillWarning, needsImprovement, planDue, planNext, warningHits, warningRulesOf } from "../src/index.ts";

test("4 Excuses against a rule of 3 → «4 Excuses الشهر ده (القاعدة 3)»; under the minimum or a rule at 0 = nothing", () => {
  const rules = [{ id: "x", trigger: "excuses" as const, min: 3, type: "خد Excuse زيادة" }, { id: "off", trigger: "absences" as const, min: 0, type: "غياب" }];
  const hits = warningHits(rules, { excuses: 4, absences: 5, lateDeductions: 0, penalties: 0 });
  assert.deepEqual(hits.map((h) => h.reason), ["4 Excuses الشهر ده (القاعدة 3)"]);
  assert.equal(warningHits(rules, { excuses: 2, absences: 0, lateDeductions: 0, penalties: 0 }).length, 0);
  assert.equal(warningHits(DEFAULT_WARNING_RULES, { excuses: 4, absences: 2, lateDeductions: 3, penalties: 2 }).length, 4);
});

test("the saved rules: nothing saved = the defaults, a broken rule is dropped", () => {
  assert.equal(warningRulesOf(undefined), DEFAULT_WARNING_RULES);
  assert.deepEqual(warningRulesOf([{ id: "a", trigger: "absences", min: 2, type: "غياب" }, { id: "b", trigger: "naps", min: 1, type: "x" }]), [{ id: "a", trigger: "absences", min: 2, type: "غياب" }]);
});

test("the template's blank takes the type", () => {
  assert.equal(fillWarning("إنذار بسبب: {type}.", "خد Excuse زيادة"), "إنذار بسبب: خد Excuse زيادة.");
});

test("under 70% needs a plan; 70 doesn't; no card isn't judged", () => {
  assert.equal(needsImprovement(69.9, 70), true);
  assert.equal(needsImprovement(70, 70), false);
  assert.equal(needsImprovement(null, 70), false);
});

test("requested → submitted → follow-up → closed, nothing skips back", () => {
  assert.equal(planNext("requested", "submit"), "submitted");
  assert.equal(planNext("submitted", "submit"), "submitted"); // the TL resends before HR follows
  assert.equal(planNext("requested", "follow"), null);
  assert.equal(planNext("submitted", "follow"), "follow_up");
  assert.equal(planNext("follow_up", "submit"), null);
  assert.equal(planNext("follow_up", "close"), "closed");
  assert.equal(planNext("requested", "close"), null);
  assert.equal(planNext("closed", "follow"), null);
});

test("the due date reminds HR from its day while the plan is open", () => {
  assert.equal(planDue("follow_up", "2026-11-15", "2026-11-15"), true);
  assert.equal(planDue("submitted", "2026-11-16", "2026-11-15"), false);
  assert.equal(planDue("closed", "2026-11-01", "2026-11-15"), false);
  assert.equal(planDue("requested", "2026-11-01", "2026-11-15"), false);
});
