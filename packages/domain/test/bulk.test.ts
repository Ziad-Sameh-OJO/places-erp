import { test } from "node:test";
import assert from "node:assert/strict";
import { assignInTurn, bulkMobiles } from "../src/bulk.ts";
import { distributeEvenly } from "../src/leads.ts";

test("bulk mobiles: one per line, a pasted column, spaces and dashes, Excel's lost 0, +20; each once; junk dropped (1.19)", () => {
  assert.deepEqual(bulkMobiles(["01012345678\n0111 234 5678\r\n012-1234-5678", "1512345678", "+20 100 000 0001", "01012345678", "0100123", "abc", "01312345678"]),
    ["01012345678", "01112345678", "01212345678", "01512345678", "01000000001"]);
  assert.deepEqual(bulkMobiles([]), []);
});

test("10 numbers on 3 salespeople → 4 / 3 / 3, in the day's order (the card's e2e numbers)", () => {
  const got = assignInTurn([...Array(10).keys()], ["a", "b", "c"]);
  const count = (p: string) => got.filter((x) => x.to === p).length;
  assert.deepEqual([count("a"), count("b"), count("c")], [4, 3, 3]);
  assert.deepEqual(got.slice(0, 4).map((x) => x.to), ["a", "b", "c", "a"]);
});

test("M-01 3.2: 50 numbers on 17 salespeople → 16 get 3 and one gets 2; the same counts as distributeEvenly", () => {
  const pool = [...Array(17).keys()].map((i) => `s${i}`);
  const got = assignInTurn([...Array(50).keys()], pool);
  const counts = pool.map((p) => got.filter((x) => x.to === p).length);
  assert.equal(counts.filter((c) => c === 3).length, 16);
  assert.equal(counts.filter((c) => c === 2).length, 1);
  assert.deepEqual(counts, pool.map((p) => distributeEvenly(50, pool).get(p)));
  assert.deepEqual(assignInTurn([1, 2], []), []);
});
