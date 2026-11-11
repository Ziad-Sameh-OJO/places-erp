/** M-04 · Q26 · the Company Profile's «عملاؤنا» page and what an Update changes. */
import { test } from "node:test";
import assert from "node:assert/strict";

const d = (iso: string) => new Date(`${iso}T10:00:00Z`);

test("«عملاؤنا»: only Done logos, oldest Done first, so a new client goes at the end", async () => {
  const { profileLogos } = await import("../src/index.ts");
  const logos = [
    { dealId: "c", doneAt: d("2026-11-10") },
    { dealId: "a", doneAt: null }, // uploaded, not Done yet
    { dealId: "b", doneAt: d("2026-11-01") },
    { dealId: "e", doneAt: d("2026-11-10") }, // same moment: by id, so the order never flips
  ];
  assert.deepEqual(profileLogos(logos).map((l) => l.dealId), ["b", "c", "e"]);
});

test("pages of 20 logos; none at all = no «عملاؤنا» page", async () => {
  const { logoPages, LOGOS_PER_PAGE } = await import("../src/index.ts");
  assert.equal(LOGOS_PER_PAGE, 20);
  assert.deepEqual(logoPages([]), []);
  assert.deepEqual(logoPages([1, 2, 3], 2), [[1, 2], [3]]);
  assert.deepEqual(logoPages(Array.from({ length: 41 }, (_, i) => i)).map((p) => p.length), [20, 20, 1]);
});

test("an Update: new Done logos, taken-back ones, a new file — nothing new = nothing to update", async () => {
  const { profileChanges } = await import("../src/index.ts");
  assert.deepEqual(profileChanges(["a"], null, null), { added: ["a"], removed: [], newBase: false, any: false }); // no file uploaded yet
  assert.equal(profileChanges([], null, "f1").any, true); // the first version: the file alone
  const pub = { dealIds: ["a", "b"], baseFileId: "f1" };
  assert.deepEqual(profileChanges(["a", "b"], pub, "f1"), { added: [], removed: [], newBase: false, any: false });
  assert.deepEqual(profileChanges(["a", "b", "c"], pub, "f1"), { added: ["c"], removed: [], newBase: false, any: true });
  assert.deepEqual(profileChanges(["b"], pub, "f1"), { added: [], removed: ["a"], newBase: false, any: true });
  assert.deepEqual(profileChanges(["a", "b"], pub, "f2"), { added: [], removed: [], newBase: true, any: true });
});
