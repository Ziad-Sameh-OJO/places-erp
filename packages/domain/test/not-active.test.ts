import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeKey, defaultDedupe, duplicateCounts, mergeColumns, mergeSheetRows, type SheetRow } from "../src/not-active.ts";

// M-03 7.1 · the Not Active sheets (voice notes 27/10). The columns are made up: the client hasn't sent the CFC sheet's yet.
const row = (unit: string, number: string, owner = "أ. وائل"): SheetRow => ({ "رقم الوحدة": unit, "الرقم": number, "المالك": owner });

test("M-03 7.1 · a second CFC sheet of 50 rows, 20 of its unit numbers already there: «متدخلش» adds only the 30 new ones", () => {
  const existing = Array.from({ length: 40 }, (_, i) => row(`C-${100 + i}`, `0100000${String(i).padStart(4, "0")}`));
  const incoming = [
    ...Array.from({ length: 20 }, (_, i) => row(`C-${120 + i}`, "01099999999")), // C-120…C-139 are in the sheet
    ...Array.from({ length: 30 }, (_, i) => row(`C-${200 + i}`, "01099999999")),
  ];
  const r = mergeSheetRows(existing, incoming, ["رقم الوحدة"], true);
  assert.equal(r.added.length, 30);
  assert.equal(r.duplicates, 20);
  assert.deepEqual(r.added.map((x) => x.data["رقم الوحدة"]), Array.from({ length: 30 }, (_, i) => `C-${200 + i}`));
  // 2.40 · the default: every row goes in, the 20 marked
  const all = mergeSheetRows(existing, incoming, ["رقم الوحدة"], false);
  assert.deepEqual([all.added.length, all.marked, all.duplicates], [50, 20, 20]);
});

test("2.40 · an owner with two numbers: both rows go in; only when all the picked columns match is it a repeat", () => {
  const sameOwner = [row("C-1", "01012345678", "أ. سمير"), row("C-2", "01198765432", "أ. سمير")];
  assert.deepEqual(mergeSheetRows([], sameOwner, ["الرقم"], true).added.length, 2);
  assert.deepEqual(mergeSheetRows([], sameOwner, ["المالك", "الرقم"], true).added.length, 2);
  // by the name alone the second is a repeat: the first of a repeat always goes in
  const byName = mergeSheetRows([], sameOwner, ["المالك"], true);
  assert.deepEqual([byName.added.length, byName.duplicates, byName.marked], [1, 1, 2]);
  // the same name and the same number (written differently) is the same row
  assert.equal(mergeSheetRows([], [row("C-1", "01012345678", "أ. سمير"), row("C-9", "+20 101 234 5678", "أ.  سمير")], ["المالك", "الرقم"], true).added.length, 1);
});

test("an empty picked cell can't be told apart: it goes in, never as a repeat; an empty row is ignored", () => {
  const r = mergeSheetRows([row("C-1", "01012345678")], [row("c-1 ", "+20 101 234 5678"), row("C-2", ""), row("C-3", ""), { "رقم الوحدة": "", "الرقم": " ", "المالك": "" }], ["الرقم"], true);
  assert.deepEqual(r.added.map((x) => x.data["رقم الوحدة"]), ["C-2", "C-3"]);
  assert.deepEqual([r.duplicates, r.noKey], [1, 2]);
  assert.equal(dedupeKey("  Cairo   Festival "), "cairo festival");
  assert.equal(dedupeKey("C-101"), "c-101");
  assert.equal(dedupeKey(undefined), "");
});

test("in the file: each repeated row knows how many others share its picked columns; the default is the number column", () => {
  const rows = [row("C-1", "01012345678"), row("C-2", "0101-234-5678"), row("C-3", "01012345678"), row("C-4", "01111111111")].map((data, i) => ({ id: `r${i}`, data }));
  assert.deepEqual([...duplicateCounts(rows, ["الرقم"])], [["r0", 2], ["r1", 2], ["r2", 2]]);
  assert.deepEqual([...duplicateCounts(rows, ["رقم الوحدة", "الرقم"])], []);
  assert.deepEqual(defaultDedupe(["رقم الوحدة", "المالك", "الرقم"]), ["الرقم"]);
  assert.deepEqual(defaultDedupe(["الكود", "الاسم"]), ["الكود"]);
});

test("a sheet keeps its columns and gains the new ones in the file's order", () => {
  assert.deepEqual(mergeColumns(["رقم الوحدة", "الرقم"], ["الرقم", "المساحة", "رقم الوحدة", "ملاحظات"]), ["رقم الوحدة", "الرقم", "المساحة", "ملاحظات"]);
});
