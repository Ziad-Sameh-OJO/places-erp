/** 0.15 · sorting a table by its column: numbers and dates by value, not as text (demo shell.js sortTable). */
import { test } from "node:test";
import assert from "node:assert/strict";

const NOW = new Date("2026-11-09T10:00:00Z");

test("money, K/M, percents and m² sort as numbers: 9,000 before 120,000", async () => {
  const { sortOrder } = await import("../src/index.ts");
  assert.deepEqual(sortOrder(["120,000 ج.م", "9,000 ج.م", "1.25M", "120K"], "asc", NOW), [1, 0, 3, 2]);
  assert.deepEqual(sortOrder(["35%", "5%", "100%"], "asc", NOW), [1, 0, 2]);
  assert.deepEqual(sortOrder(["٢٥٠", "٣٥", "1,100.50"], "asc", NOW), [1, 0, 2]); // Arabic digits too
});

test("dates by day, not as text: «٣٠ أكتوبر» before «٤ نوفمبر»; a year shown counts", async () => {
  const { sortOrder } = await import("../src/index.ts");
  assert.deepEqual(sortOrder(["٤ نوفمبر", "٣٠ أكتوبر", "12 نوفمبر 2025"], "asc", NOW), [2, 1, 0]);
  assert.deepEqual(sortOrder(["4 Nov", "30 Oct", "1 Sept"], "asc", NOW), [2, 1, 0]);
  assert.deepEqual(sortOrder(["٤ نوفمبر ٩:١٥ م", "٤ نوفمبر ١١:٠٠ ص"], "asc", NOW), [1, 0]);
});

test("«من 3 يوم» is older than «من 5 س»; «دلوقتي» newest", async () => {
  const { sortOrder } = await import("../src/index.ts");
  assert.deepEqual(sortOrder(["من 5 س", "دلوقتي", "من 3 يوم", "من 12 د"], "asc", NOW), [2, 0, 3, 1]);
});

test("text and codes: Arabic order, U-99 before U-101; «—» last both ways; descending flips", async () => {
  const { sortOrder, nextSort } = await import("../src/index.ts");
  assert.deepEqual(sortOrder(["U-101", "U-99", "—"], "asc", NOW), [1, 0, 2]);
  assert.deepEqual(sortOrder(["U-101", "—", "U-99"], "desc", NOW), [0, 2, 1]);
  assert.deepEqual(sortOrder(["محمد", "أحمد", "سارة"], "asc", NOW), [1, 2, 0]);
  assert.deepEqual(nextSort(null, 2), { col: 2, dir: "asc" });
  assert.deepEqual(nextSort({ col: 2, dir: "asc" }, 2), { col: 2, dir: "desc" });
  assert.deepEqual(nextSort({ col: 2, dir: "desc" }, 2), { col: 2, dir: "asc" });
  assert.deepEqual(nextSort({ col: 2, dir: "desc" }, 3), { col: 3, dir: "asc" });
});
