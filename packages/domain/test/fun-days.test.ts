/** M-05 · «الترفيه والاحتفالات» (HR, 15 Nov): who a fun day is for, its reminders, the year's starters. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dueFunDayReminders, funDayIsFor, funDayText, starterDate, FUN_DAY_STARTERS } from "../src/index.ts";

test("no department chosen = everyone; chosen ones = only their people", () => {
  assert.equal(funDayIsFor([], "المبيعات"), true);
  assert.equal(funDayIsFor([], null), true);
  assert.equal(funDayIsFor(["HR", "Marketing"], "Marketing"), true);
  assert.equal(funDayIsFor(["HR", "Marketing"], "المبيعات"), false);
  assert.equal(funDayIsFor(["HR"], null), false);
});

// Cairo is UTC+2 in December: 09:00 Cairo = 07:00Z
const event = { date: "2026-12-31", cancelled: false, notifiedAt: new Date("2026-12-01T10:00:00Z"), dayBeforeSentAt: null, morningSentAt: null };

test("the day before and the morning of, each from 09:00 Cairo, once", () => {
  assert.deepEqual(dueFunDayReminders(event, new Date("2026-12-30T06:59:00Z")), []);
  assert.deepEqual(dueFunDayReminders(event, new Date("2026-12-30T07:00:00Z")), ["dayBefore"]);
  assert.deepEqual(dueFunDayReminders({ ...event, dayBeforeSentAt: new Date("2026-12-30T07:00:00Z") }, new Date("2026-12-30T15:00:00Z")), []);
  assert.deepEqual(dueFunDayReminders({ ...event, dayBeforeSentAt: new Date() }, new Date("2026-12-31T07:05:00Z")), ["morning"]);
  assert.deepEqual(dueFunDayReminders({ ...event, dayBeforeSentAt: new Date(), morningSentAt: new Date() }, new Date("2026-12-31T08:00:00Z")), []);
});

test("a missed «بكره» isn't sent on the day; nothing after the day; nothing when cancelled", () => {
  assert.deepEqual(dueFunDayReminders(event, new Date("2026-12-31T08:00:00Z")), ["morning"]);
  assert.deepEqual(dueFunDayReminders(event, new Date("2027-01-01T08:00:00Z")), []);
  assert.deepEqual(dueFunDayReminders({ ...event, cancelled: true }, new Date("2026-12-30T08:00:00Z")), []);
});

test("published (or re-dated) the same day: the publish notice already said it", () => {
  const late = { ...event, notifiedAt: new Date("2026-12-30T10:00:00Z") }; // published on the day before
  assert.deepEqual(dueFunDayReminders(late, new Date("2026-12-30T12:00:00Z")), []);
  assert.deepEqual(dueFunDayReminders(late, new Date("2026-12-31T07:00:00Z")), ["morning"]);
});

test("the notice: «يوم <التاريخ>: <العنوان>», with time and place when given", () => {
  assert.equal(funDayText({ title: "احتفال رأس السنة", date: "2026-12-31" }), "يوم الخميس، 31 ديسمبر: احتفال رأس السنة");
  assert.equal(funDayText({ title: "يوم رياضي", date: "2026-12-31", time: "15:00", place: "النادي" }, "dayBefore"), "بكره · يوم الخميس، 31 ديسمبر: يوم رياضي · الساعة 15:00 · في النادي");
  assert.match(funDayText({ title: "x", date: "2026-12-31" }, "morning"), /^النهارده · /);
});

test("starters: a fixed day, the working day before an official holiday, or HR picks", () => {
  const s = (k: string) => FUN_DAY_STARTERS.find((x) => x.key === k)!;
  const holidays = [{ from: "2027-03-10", label: "عيد الفطر" }, { from: "2027-05-16", label: "عيد الأضحى" }];
  assert.equal(starterDate(s("newYear"), 2027, holidays), "2027-01-01");
  assert.equal(starterDate(s("eidFitr"), 2027, holidays), "2027-03-09"); // Tuesday before
  assert.equal(starterDate(s("eidAdha"), 2027, holidays), "2027-05-15"); // Saturday (Friday off isn't hit)
  assert.equal(starterDate(s("eidFitr"), 2027, [{ from: "2027-03-13", label: "عيد الفطر" }]), "2027-03-11"); // the 12th is a Friday
  assert.equal(starterDate(s("ramadan"), 2027, holidays), null);
  assert.equal(starterDate(s("shamNessim"), 2027, holidays), null);
});
