import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldAccess, fieldRuleProblem, mergeFieldRules } from "../src/fields.ts";

test("several roles: the most permissive wins, a role without a rule shows the field", () => {
  const sales = { inventory: { ownerPhone: "hide", pricePerSqm: "hide", commission: "read" } } as const;
  const tl = { inventory: { ownerPhone: "hide", pricePerSqm: "read" } } as const;
  assert.deepEqual(mergeFieldRules([sales, tl]), { inventory: { ownerPhone: "hide", pricePerSqm: "read" } }); // commission: tl shows it
  assert.deepEqual(mergeFieldRules([sales]), { inventory: { ownerPhone: "hide", pricePerSqm: "hide", commission: "read" } });
  assert.deepEqual(mergeFieldRules([]), {});
});

test("a hidden price takes the total and the yield with it; read-only fields are fixed, not hidden", () => {
  const a = fieldAccess({ inventory: { pricePerSqm: "hide", commission: "read", divisible: "hide" } });
  assert.deepEqual([...a.hidden("inventory")].sort(), ["divisible", "minSplit", "pricePerSqm", "splitNote", "total", "totalPrice", "yield"]);
  assert.ok(a.fixed("inventory").has("commission") && !a.hidden("inventory").has("commission"));
  assert.equal(a.mode("inventory", "commission"), "read");
  assert.equal(a.mode("inventory", "floor"), "show");
  assert.equal(a.hidden("leads").size, 0);
});

test("the unit's identity can't be hidden; an unknown field is refused", () => {
  assert.equal(fieldAccess({ inventory: { code: "hide" } }).mode("inventory", "code"), "show");
  assert.match(fieldRuleProblem("inventory", "project", "hide", false) ?? "", /لازم يفضل ظاهر/);
  assert.equal(fieldRuleProblem("inventory", "ownerPhone", "hide", true), null);
  assert.equal(fieldRuleProblem("inventory", "nope", "hide", false), "الحقل ده مش موجود");
});
