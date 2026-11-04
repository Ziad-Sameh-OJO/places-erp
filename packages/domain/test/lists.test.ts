import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedValue, asListValues, listChangeProblem } from "../src/lists.ts";

const on = (value: string) => ({ value, active: true });
const off = (value: string) => ({ value, active: false });
// the client's areas (seed) and the accountant's receive sources (4 Nov)
const areas = [on("التجمع الخامس"), on("الشيخ زايد"), on("أكتوبر")];
const sources = [on("عمولة من عميل"), on("إيراد آخر"), on("استرداد")];

test("adding and switching off are fine; nothing is ever removed (M-13 2.1: تتوقف بدل ما تتمسح)", () => {
  assert.equal(listChangeProblem(areas, [...areas, on("المعادي")]), null);
  assert.equal(listChangeProblem(areas, [areas[0]!, off("الشيخ زايد"), areas[2]!]), null);
  assert.equal(listChangeProblem([off("الشيخ زايد")], [on("الشيخ زايد")]), null); // back on
  assert.match(listChangeProblem(areas, [areas[0]!, areas[2]!])!, /الشيخ زايد.*ماتتمسحش/);
});

test("a locked value (the system posts on it) can't be switched off or removed", () => {
  const locked = ["عمولة من عميل"];
  assert.equal(listChangeProblem(sources, [...sources, on("إيجار")], locked), null);
  assert.equal(listChangeProblem(sources, [sources[0]!, off("إيراد آخر"), sources[2]!], locked), null);
  assert.match(listChangeProblem(sources, [off("عمولة من عميل"), sources[1]!, sources[2]!], locked)!, /عمولة من عميل.*ماتتوقفش/);
  assert.match(listChangeProblem(sources, sources.slice(1), locked)!, /عمولة من عميل/);
});

test("old plain-text lists read as all active", () => {
  assert.deepEqual(asListValues(["Facebook", "TikTok"]), [on("Facebook"), on("TikTok")]);
  assert.deepEqual(asListValues([off("TikTok")]), [off("TikTok")]);
  assert.deepEqual(asListValues(null), []);
});

test("a form stores an active value, or keeps the one the record already has after it was switched off", () => {
  const list = [on("متشطب"), off("نص تشطيب")];
  assert.equal(allowedValue(list, "متشطب"), true);
  assert.equal(allowedValue(list, "نص تشطيب"), false); // a new record can't pick it
  assert.equal(allowedValue(list, "نص تشطيب", "نص تشطيب"), true); // an old one keeps it
  assert.equal(allowedValue(list, "مفروش"), false);
});
