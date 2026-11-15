/** M-05 · the employee file (HR, 15 Nov): missing papers, the sheet's month name, the last-week reminder, the report's summary. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DOC_TYPES, answersSummary, lastWeekOfMonth, missingDocs } from "../src/index.ts";

test("missing papers: the required ones not uploaded, in the setting's order", () => {
  assert.deepEqual(missingDocs(DEFAULT_DOC_TYPES, ["شهادة الميلاد", null, "عقد"]), ["البطاقة (وش وضهر)", "شهادة التخرج", "فيش وتشبيه", "صور شخصية", "شهادة التجنيد"]);
  assert.deepEqual(missingDocs(["فيش وتشبيه"], ["فيش وتشبيه", "فيش وتشبيه"]), []);
});

test("the last week of the month: its last 7 days (30-day Nov from the 24th, Feb 2027 from the 22nd)", () => {
  assert.equal(lastWeekOfMonth("2026-11-23"), false);
  assert.equal(lastWeekOfMonth("2026-11-24"), true);
  assert.equal(lastWeekOfMonth("2026-11-30"), true);
  assert.equal(lastWeekOfMonth("2027-02-21"), false);
  assert.equal(lastWeekOfMonth("2027-02-22"), true);
});

test("answers summary skips the empty ones", () => {
  assert.equal(answersSummary({ "محتاج تدريب في إيه؟": " Excel ", "تقييمك لنفسك؟": "" }), "محتاج تدريب في إيه؟: Excel");
});
