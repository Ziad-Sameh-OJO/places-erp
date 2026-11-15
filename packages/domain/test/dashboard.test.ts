import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_STAGES, budgetBroken, dashboardLayout, dashboardPeriods, lateWithoutExcuse, opensOnDashboard, targetProgress, teamProgress, topAchiever, topSales,
} from "../src/dashboard.ts";

const EGP = 100; // piasters

test("14.1 · Ahmed's and Safwat's layouts only for whoever sees the whole company; anyone else gets his role's", () => {
  const head = { reportsView: true, scope: "all" as const };
  assert.equal(dashboardLayout("ahmed", head), "ahmed");
  assert.equal(dashboardLayout("safwat", head), "safwat");
  assert.equal(dashboardLayout(null, head), "role");
  assert.equal(dashboardLayout("unknown", head), "role");
  assert.equal(dashboardLayout("ahmed", { reportsView: false, scope: "all" }), "role");
  assert.equal(dashboardLayout("safwat", { reportsView: true, scope: "team" }), "role");
  assert.equal(opensOnDashboard("ahmed"), true);
  assert.equal(opensOnDashboard("role"), false); // the others still open on «مهامي النهارده»
});

test("14.2 · the stages counted leave Not Interested out", () => {
  assert.deepEqual([...DASHBOARD_STAGES], ["Interested", "Visit", "Meeting", "Near to Close", "Done Deal"]);
});

test("14.2 · the periods: the office week Saturday–Friday, the quarter's months, the year's", () => {
  const p = dashboardPeriods("2026-11-15"); // a Sunday
  assert.deepEqual(p.week, { from: "2026-11-14", to: "2026-11-20" });
  assert.equal(p.month, "2026-11");
  assert.equal(p.quarter, "2026-Q4");
  assert.deepEqual(p.quarterMonths, ["2026-10", "2026-11", "2026-12"]);
  assert.equal(p.yearMonths.length, 12);
  assert.equal(dashboardPeriods("2026-03-31").quarter, "2026-Q1");
});

test("14.2 · the target bar: 600,000 achieved of 1,000,000 = 60%; no goal = no bar", () => {
  assert.equal(targetProgress(600_000 * EGP, 1_000_000 * EGP), 60);
  assert.equal(targetProgress(1_250_000 * EGP, 1_000_000 * EGP), 125);
  assert.equal(targetProgress(100 * EGP, 0), null);
});

test("14.2 · a team's percent is its sums, not the average of its people's percents", () => {
  const t = teamProgress([{ goal: 1_000_000 * EGP, achieved: 600_000 * EGP }, { goal: 500_000 * EGP, achieved: 0 }]);
  assert.equal(t.percent, 40); // 600k of 1.5M (the average would say 30%)
});

test("14.3 · the top 3 by percent, then the most achieved; the top achiever by amount", () => {
  const rows = [
    { name: "a", percent: 50, achieved: 500 * EGP }, { name: "b", percent: 90, achieved: 300 * EGP },
    { name: "c", percent: null, achieved: 0 }, { name: "d", percent: 50, achieved: 700 * EGP },
  ];
  assert.deepEqual(topSales(rows, 3).map((r) => r.name), ["b", "d", "a"]);
  assert.deepEqual(topSales([{ name: "e", percent: null, achieved: 0 }], 3), []); // no goal, nothing achieved: not ranked
  assert.equal(topAchiever(rows)?.name, "d");
  assert.equal(topAchiever([{ achieved: 0 }]), null);
});

test("14.3 · late without an Excuse; a broken budget line", () => {
  assert.equal(lateWithoutExcuse({ kind: "CHECKIN", lateMinutes: 20 }), true);
  assert.equal(lateWithoutExcuse({ kind: "EXCUSE", lateMinutes: 20 }), false);
  assert.equal(lateWithoutExcuse({ kind: "CHECKIN", lateMinutes: 0 }), false);
  assert.equal(budgetBroken(12_000 * EGP, 10_000 * EGP), true);
  assert.equal(budgetBroken(10_000 * EGP, 10_000 * EGP), false);
  assert.equal(budgetBroken(500 * EGP, null), false);
});
