import { test } from "node:test";
import assert from "node:assert/strict";
import { nameContains, nameKey, nameSimilarity, sameName, similarNames, SIMILAR_NAME_MIN } from "../src/company-names.ts";

test("one shape for the letters people write either way: hamza, taa marbuta, alef maqsura, tashkeel, case, spaces", () => {
  assert.equal(nameKey("إعمار مصر"), "اعمار مصر");
  assert.equal(nameKey("  أوراسكوم   للإنشاءات "), "اوراسكوم للانشاءات");
  assert.equal(nameKey("شركة المُستقبل"), "شركه المستقبل");
  assert.equal(nameKey("مبنى ١٢"), "مبني 12");
  assert.equal(nameKey("EMAAR-Misr."), "emaar misr");
  assert.ok(sameName("إعمار مصر", "اعمار  مصر"));
  assert.ok(sameName("Palm Hills", "palm hills"));
  assert.ok(!sameName("Palm Hills", "Palm Hill"));
  assert.ok(!sameName("", ""));
});

test("the search finds the company however its name was typed", () => {
  assert.ok(nameContains("إعمار مصر للتنمية", "اعمار"));
  assert.ok(nameContains("شركة النيل", "شركه"));
  assert.ok(nameContains("Emaar Misr", "emaarmisr"));
  assert.ok(nameContains("Emaar Misr", "EMAAR"));
  assert.ok(!nameContains("Emaar Misr", "Emmar"));
  assert.ok(!nameContains("Emaar Misr", "  "));
});

test("close names score at or above the bar, different ones below it", () => {
  assert.ok(nameSimilarity("Emmar", "Emaar") >= SIMILAR_NAME_MIN);
  assert.ok(nameSimilarity("Mountin", "Mountain View") >= SIMILAR_NAME_MIN); // one word typed, inside a longer name
  assert.ok(nameSimilarity("سوديك", "سودك") >= SIMILAR_NAME_MIN);
  assert.ok(nameSimilarity("Vodafone", "Vodafon") >= SIMILAR_NAME_MIN);
  assert.ok(nameSimilarity("Emaar", "Orascom") < SIMILAR_NAME_MIN);
  assert.ok(nameSimilarity("Vodafone", "Valu") < SIMILAR_NAME_MIN);
  assert.equal(nameSimilarity("إعمار", "اعمار"), 1);
});

test("«تقصد»: the closest names first, at most three, never one the search already finds", () => {
  const sheet = ["Emaar Misr", "Emaar Misr", "Emirates NBD", "Orascom", "Palm Hills", "Valu", "Vodafone Egypt"];
  assert.deepEqual(similarNames("Emmar", sheet), ["Emaar Misr"]);
  assert.deepEqual(similarNames("Vodafoen", sheet), ["Vodafone Egypt"]);
  assert.deepEqual(similarNames("Emaar", sheet), []); // «Emaar Misr» is in the results already
  assert.deepEqual(similarNames("xyz", sheet), []);
  assert.ok(similarNames("Em", ["Ema", "Emb", "Emc", "Emd", "Eme"]).length <= 3);
});
