/**
 * T-34 · M-12: every «[أوتوماتيك]» item of the client's KPI file has a metric that measures it, and the arithmetic of the
 * metrics added for it, with the file's own numbers (Hadeer 100 calls a day, Rahma's Broadcast twice a week, Ahmed
 * Ashraf's payroll in the first 5 days and the month closed before the 5th, Nancy's sheets on the first working day).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayStart } from "../src/business-time.ts";
import {
  METRICS, calcText, firstWorkingDay, metricProblem, monthCloseDeadline, monthlyOnTime, payrollDeadline, perWorkingDay, sheetsOnTime, twiceWeekly,
  workingDaysSince,
} from "../src/kpi.ts";

const at = (d: string, hh = 12) => new Date(dayStart(d).getTime() + hh * 3_600_000); // a Cairo hour of that day

test("Hadeer «100 مكالمة في اليوم»: the calls over the working days (Friday off)", () => {
  // Sun 1 Nov → Sat 7 Nov 2026: six working days, Friday 6 Nov off
  assert.equal(workingDaysSince(at("2026-11-01"), at("2026-11-07")), 6);
  assert.equal(perWorkingDay(600, at("2026-11-01"), at("2026-11-07")), 100);
  assert.equal(perWorkingDay(84, at("2026-11-01", 9), at("2026-11-01", 15)), 84, "the first day counts as one");
});

test("Rahma «الـ Broadcast يومين في الأسبوع»: sent with Hot Inventory ÷ 2 a week", () => {
  const from = at("2026-10-01");
  assert.equal(twiceWeekly(6, from, at("2026-10-22")), 100); // 3 weeks → 6 due
  assert.equal(twiceWeekly(5, from, at("2026-10-22")), 83.3);
  assert.equal(twiceWeekly(1, from, at("2026-10-03")), 50, "the first week counts as a whole week");
  assert.equal(twiceWeekly(3, from, at("2026-10-08")), 150, "may pass 100% (answers 28/10)");
});

test("Ahmed Ashraf: payroll in the month's first 5 days, the monthly close before the next month's 5th", () => {
  const paid: Record<string, Date> = { "2026-10": at("2026-10-05", 18), "2026-11": at("2026-11-06", 10) };
  const now = at("2026-11-20");
  // October on time (the 5th), November late (the 6th), December not due yet → 1 of 2
  assert.equal(monthlyOnTime("2026-Q4", (m) => paid[m] ?? null, (m) => payrollDeadline(m), now), 50);
  // nothing paid in November and its 5th has passed → late too
  assert.equal(monthlyOnTime("2026-Q4", (m) => (m === "2026-10" ? paid[m]! : null), (m) => payrollDeadline(m), now), 50);
  assert.equal(monthlyOnTime("2026-Q4", () => null, (m) => payrollDeadline(m), at("2026-10-03")), null, "nothing due yet");

  assert.deepEqual(monthCloseDeadline("2026-12"), dayStart("2027-01-05"));
  assert.deepEqual(monthCloseDeadline("2026-10"), dayStart("2026-11-05"));
  const closed: Record<string, Date> = { "2026-10": at("2026-10-31", 18) };
  assert.equal(monthlyOnTime("2026-Q4", (m) => closed[m] ?? null, (m) => monthCloseDeadline(m), at("2026-11-20")), 100, "only October is due");
  assert.equal(monthlyOnTime("2026-Q4", (m) => closed[m] ?? null, (m) => monthCloseDeadline(m), at("2026-12-06")), 50, "November wasn't closed");
});

test("Nancy «100% في أول يوم عمل من الربع»: the last quarter's sheets by the end of the first working day", () => {
  assert.equal(firstWorkingDay("2026-Q4"), "2026-10-01"); // a Thursday
  assert.equal(firstWorkingDay("2027-Q1"), "2027-01-02", "1 Jan 2027 is a Friday");
  assert.equal(sheetsOnTime(at("2026-10-01", 18), "2026-Q4", at("2026-10-10")), 100);
  assert.equal(sheetsOnTime(at("2026-10-02", 10), "2026-Q4", at("2026-10-10")), 0);
  assert.equal(sheetsOnTime(null, "2026-Q4", at("2026-10-01", 15)), null, "still in time");
  assert.equal(sheetsOnTime(null, "2026-Q4", at("2026-10-03")), 0);
});

test("the new settings are in the catalog, and the «بيتحسب» line says what each counts", () => {
  assert.equal(metricProblem("tickets", { ttype: "hr_letter" }), null);
  assert.equal(metricProblem("tasksOnTime", { tkind: "team" }), null);
  // the CEO's «القادة الأربعة + رحمة» names its people; only «متوسط كروت فريقه» takes a list
  const named = { ids: ["e1", "e2"] } as unknown as Parameters<typeof metricProblem>[1];
  assert.equal(metricProblem("team", named), null);
  assert.match(metricProblem("calls", named) ?? "", /مالوش إعداد ids/);
  assert.equal(metricProblem("visitsDone", { kind: "Visit", per: "quarter", of: "team" }), null);
  assert.match(metricProblem("budgetUse", { per: "week" }) ?? "", /مالوش إعداد per/);
  const line = (metric: string, params: Record<string, string>) =>
    calcText({ method: "system", metric, params, report: null, required: null, enteredBy: [], source: "" }, String);
  assert.equal(line("tickets", { ttype: "hr_letter" }), "% من التذاكر «HR Letter» اللي اتقفلت في ميعادها");
  assert.equal(line("tickets", {}), "% من التذاكر اللي اتقفلت في ميعادها");
  assert.equal(line("tasksOnTime", { tkind: "team" }), "مهام «مهمة من منار» اللي اتبعتتله واتعملت Done في ميعادها ÷ كل المهام دي اللي ميعادها جه");
  assert.equal(line("visitsDone", { kind: "Visit", per: "quarter", of: "team" }), "متوسط عدد الـ Visit اللي اتعلّم عليها Done لكل بياع في فريقه · الربع ده");
  assert.equal(line("unitsEntered", { by: "me" }), "عدد الوحدات اللي دخّلها هو اللي دخلت الانفنتوري الربع ده");
});

/**
 * The client's file (requirements M-12, «[أوتوماتيك]»): every system item of the seeded cards has a catalog metric with
 * settings it takes, except the ones still waiting for the client (the PR's «أسئلة», issue #48).
 */
const OPEN = new Set([
  "نمو الوحدات النشطة (متاحة + متحقق منها)", // a baseline (the quarter's start) the system doesn't keep yet
  "دقة حساب العمولات", // no «اعتماد» of a commission to count corrections after
  "تسجيل الحضور قبل 12 والجزاءات في نفس اليوم",
  "تسجيل الإكسكيوز والإجازات يومياً",
  "تطبيق جزاءات التصرفات المهمة + التخطي",
  "عدد الليدز المؤهلة (مش إجمالي الليدز)", // +15% over October's baseline
  "تسجيل توقيت وصول كل ليد على واتساب الحملة", // the campaign WhatsApp is outside the system
  "التزام الـ SLA (تصميم 48 ساعة)", // no design task / ticket in the system
  "صفر تكرار في قاعدة البيانات", // no duplicate-unit check in the database
  "تنسيق أماكن التصوير في نفس اليوم",
]);

test("every automatic item of the client's file has a metric (or is an open question)", () => {
  type Item = { title: string; method: string; metric?: string | null; params?: Record<string, unknown> };
  type Card = { items: Item[] };
  const k = JSON.parse(readFileSync(new URL("../../db/prisma/seed-data/kpi-q4-2026.json", import.meta.url), "utf8")) as {
    cards: Record<string, Card>; sales: Card; teamLeaders: { card: Card };
  };
  const items = [...Object.values(k.cards), k.sales, k.teamLeaders.card].flatMap((c) => c.items).filter((it) => it.method === "system");
  const missing = items.filter((it) => !it.metric).map((it) => it.title);
  assert.deepEqual([...new Set(missing)].sort(), [...OPEN].sort());
  for (const it of items.filter((x) => x.metric)) {
    assert.ok(METRICS[it.metric!], `${it.title}: ${it.metric} is in the catalog`);
    // `ids` (the CEO's «القادة الأربعة + رحمة») is the people list of «team», not a setting
    const params = Object.fromEntries(Object.entries(it.params ?? {}).filter(([k]) => k !== "ids"));
    assert.equal(metricProblem(it.metric!, params as Record<string, string>), null, it.title);
  }
});
