import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeKey, mergeColumns, mergeSheetRows, type SheetRow } from "../src/not-active.ts";

// M-03 7.1 · the Not Active sheets (voice notes 27/10). The columns are made up: the client hasn't sent the CFC sheet's yet.
const row = (unit: string, number: string): SheetRow => ({ "رقم الوحدة": unit, "الرقم": number, "المالك": "أ. وائل" });

test("M-03 7.1 · a second CFC sheet of 50 rows, 20 of its unit numbers already there: only the 30 new ones are added", () => {
  const existing = Array.from({ length: 40 }, (_, i) => row(`C-${100 + i}`, `0100000${String(i).padStart(4, "0")}`));
  const incoming = [
    ...Array.from({ length: 20 }, (_, i) => row(`C-${120 + i}`, "01099999999")), // C-120…C-139 are in the sheet
    ...Array.from({ length: 30 }, (_, i) => row(`C-${200 + i}`, "01099999999")),
  ];
  const r = mergeSheetRows(existing, incoming, "رقم الوحدة");
  assert.equal(r.added.length, 30);
  assert.equal(r.duplicates, 20);
  assert.equal(r.noKey, 0);
  assert.deepEqual(r.added.map((x) => x.data["رقم الوحدة"]), Array.from({ length: 30 }, (_, i) => `C-${200 + i}`));
});

test("Manar picks the column (M-03 1.1): by the number, the same 50 rows are all duplicates of one another but the first", () => {
  const incoming = Array.from({ length: 50 }, (_, i) => row(`C-${300 + i}`, "01099999999"));
  const r = mergeSheetRows([], incoming, "الرقم");
  assert.equal(r.added.length, 1);
  assert.equal(r.duplicates, 49);
});

test("the same value written differently is the same row; an empty cell can't be told apart and is left out", () => {
  const existing = [row("C-1", "01012345678")];
  const r = mergeSheetRows(existing, [row("c-1 ", "+20 101 234 5678"), row("C-2", "0101-234-5678"), row("", "01111111111"), row("C-3", "")], "الرقم");
  assert.deepEqual(r.added.map((x) => x.key), ["01111111111"]);
  assert.equal(r.duplicates, 2);
  assert.equal(r.noKey, 1);
  assert.equal(dedupeKey("  Cairo   Festival "), "cairo festival");
  assert.equal(dedupeKey("C-101"), "c-101");
  assert.equal(dedupeKey(undefined), "");
});

test("a sheet keeps its columns and gains the new ones in the file's order", () => {
  assert.deepEqual(mergeColumns(["رقم الوحدة", "الرقم"], ["الرقم", "المساحة", "رقم الوحدة", "ملاحظات"]), ["رقم الوحدة", "الرقم", "المساحة", "ملاحظات"]);
});
