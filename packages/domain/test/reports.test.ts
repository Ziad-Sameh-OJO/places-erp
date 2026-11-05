import { test } from "node:test";
import assert from "node:assert/strict";
import { PLACES_CALENDAR } from "../src/business-time.ts";
import { dailyAverage, dailySumValue, dailyTotals, dayStatus, dueOf, handInStep, isOffPeriod, nextDue, pickPeople } from "../src/reports.ts";
import { behindPace, dealRowOf, monthBounds, periodFigures, ranked, targetPercent, tlTiersOf, type DealRow } from "../src/targets.ts";

// Cairo is UTC+2 in November 2026
const at = (s: string) => new Date(s);

test("11.10 · due moments: weekly Sunday, monthly the 1st, the 31st is the month's last day, quarterly in its first month", () => {
  const now = at("2026-11-05T10:00:00Z"); // Thursday
  assert.deepEqual(dueOf({ freq: "weekly", day: 0, time: "09:00" }, now), { period: "2026-11-01", due: at("2026-11-01T07:00:00Z") });
  assert.equal(dueOf({ freq: "monthly", day: 1, time: "09:00" }, now).period, "2026-11-01");
  assert.equal(dueOf({ freq: "monthly", day: 31, time: "09:00" }, now).period, "2026-11-30");
  assert.equal(dueOf({ freq: "quarterly", day: 5, time: "09:00" }, now).period, "2026-10-05");
  assert.deepEqual(dueOf({ freq: "daily", day: 0, time: "18:00" }, now), { period: "2026-11-05", due: at("2026-11-05T16:00:00Z") });
});

test("11.10 · daily reports skip Fridays and official holidays", () => {
  const daily = { freq: "daily" as const, day: 0, time: "18:00" };
  assert.equal(isOffPeriod(daily, "2026-11-06"), true); // Friday
  assert.equal(isOffPeriod(daily, "2026-11-05"), false);
  assert.equal(isOffPeriod(daily, "2026-11-05", { ...PLACES_CALENDAR, holidays: new Set(["2026-11-05"]) }), true);
  assert.equal(isOffPeriod({ ...daily, freq: "weekly" }, "2026-11-06"), false);
  // «الجاي»: Thursday after 18:00 → Saturday 18:00 (Friday is off); a weekly Sunday report → next Sunday
  assert.deepEqual(nextDue(daily, at("2026-11-05T17:00:00Z")), at("2026-11-07T16:00:00Z"));
  assert.deepEqual(nextDue({ freq: "weekly", day: 0, time: "09:00" }, at("2026-11-05T10:00:00Z")), at("2026-11-08T07:00:00Z"));
});

test("11.10 · with the clock: a reminder before the deadline, then one late notice after it", () => {
  const due = at("2026-11-05T16:00:00Z"), none = { reminded: false, late: false };
  assert.equal(handInStep(due, 60, at("2026-11-05T14:30:00Z"), none), null);
  assert.equal(handInStep(due, 60, at("2026-11-05T15:10:00Z"), none), "remind");
  assert.equal(handInStep(due, 60, at("2026-11-05T15:20:00Z"), { reminded: true, late: false }), null);
  assert.equal(handInStep(due, 60, at("2026-11-05T16:01:00Z"), { reminded: true, late: false }), "late");
  assert.equal(handInStep(due, 60, at("2026-11-05T17:00:00Z"), { reminded: true, late: true }), null);
});

test("11.10 · who a report names: people, roles and the person's follower, once each", () => {
  const users = [{ id: "u1", roles: ["admin"] }, { id: "u2", roles: ["ops"] }, { id: "u3", roles: ["sales"] }, { id: "u4", roles: ["sales", "ops"] }];
  assert.deepEqual(pickPeople(["ops", "u1", "u4"], users).sort(), ["u1", "u2", "u4"]);
  assert.deepEqual(pickPeople(["follower"], users, "u3"), ["u3"]);
  assert.deepEqual(pickPeople(["follower"], users, "gone"), []);
});

test("11.12 · the daily report adds up: day, last 7 days, month and quarter are sums of the days", () => {
  const days = [{ day: "2026-10-01", value: 3 }, { day: "2026-10-30", value: 4 }, { day: "2026-11-01", value: 5 }, { day: "2026-11-04", value: 2 }, { day: "2026-11-05", value: 1 }];
  assert.deepEqual(dailyTotals(days, "2026-11-05"), { day: 1, week: 12, month: 8, quarter: 15 });
  assert.equal(dailySumValue(days, "2026-11-05", {}), 15);
  assert.equal(dailySumValue(days, "2026-11-05", { per: "month" }), 8);
  // 36 days into the quarter = 6 weeks → 15 / 6
  assert.equal(dailySumValue(days, "2026-11-05", { avg: "week" }), 2.5);
});

test("11.9 · website ads: the average a day of the last 7 days that have a number", () => {
  const days = [{ day: "2026-10-28", value: 100 }, { day: "2026-10-30", value: 20 }, { day: "2026-11-04", value: 27 }, { day: "2026-11-05", value: 28 }];
  assert.equal(dailyAverage(days, "2026-11-05"), 25); // 10-28 is 8 days back: out
  assert.equal(dailyAverage([], "2026-11-05"), 0);
});

test("11.12 · a day's report: on time, late, not handed in, a day off", () => {
  const due = at("2026-11-05T16:00:00Z");
  assert.equal(dayStatus(at("2026-11-05T15:00:00Z"), due, at("2026-11-06T10:00:00Z"), false), "onTime");
  assert.equal(dayStatus(at("2026-11-05T16:30:00Z"), due, at("2026-11-06T10:00:00Z"), false), "late");
  assert.equal(dayStatus(null, due, at("2026-11-06T10:00:00Z"), false), "missing");
  assert.equal(dayStatus(null, due, at("2026-11-06T10:00:00Z"), true), "off");
  assert.equal(dayStatus(null, due, at("2026-11-05T10:00:00Z"), false), "open");
});

const deal = (over: Partial<DealRow>): DealRow => ({
  status: "Approved", commissionOwner: 0, commissionClient: 0, targetBase: null, offTarget: false, buyers: ["s1"], sellers: [], sellerApproved: true, payments: [], ...over,
});

test("11.8 · 1.5M of a 3M target is 50%: only the month's collections, a Transaction in the month of the first one", () => {
  const nov = [at("2026-10-31T22:00:00Z"), at("2026-11-30T22:00:00Z")] as const;
  const deals = [
    // 3M collected in November: half to the Buyer side (s1), half to the Seller side (s2)
    deal({ sellers: ["s2"], payments: [{ side: "owner", amount: 150_000_000, at: at("2026-11-03T10:00:00Z") }, { side: "client", amount: 150_000_000, at: at("2026-11-04T10:00:00Z") }] }),
    // collected in October: not November's (the Buyer half: 250K)
    deal({ payments: [{ side: "owner", amount: 50_000_000, at: at("2026-10-20T10:00:00Z") }] }),
    // cancelled: drops out everywhere (Q12)
    deal({ status: "Cancelled", payments: [{ side: "owner", amount: 90_000_000, at: at("2026-11-10T10:00:00Z") }] }),
  ];
  const f = periodFigures("s1", deals, ...nov);
  assert.deepEqual(f, { achieved: 150_000_000, share: 150_000_000, transactions: 1 });
  assert.equal(targetPercent(f.achieved, 300_000_000), 50);
  assert.deepEqual(periodFigures("s1", deals, at("2026-09-30T22:00:00Z"), nov[0]), { achieved: 25_000_000, share: 25_000_000, transactions: 1 });
});

test("11.8 · a «note» override counts once, in the month of the first collection", () => {
  const d = deal({ targetBase: 10_000_000, payments: [{ side: "owner", amount: 1_000_000, at: at("2026-10-10T10:00:00Z") }, { side: "client", amount: 1_000_000, at: at("2026-11-10T10:00:00Z") }] });
  assert.equal(periodFigures("s1", [d], at("2026-09-30T22:00:00Z"), at("2026-10-31T22:00:00Z")).achieved, 5_000_000);
  assert.equal(periodFigures("s1", [d], at("2026-10-31T22:00:00Z"), at("2026-11-30T22:00:00Z")).achieved, 0);
});

test("11.8 · the TL hears of whoever is under 60% of the month gone by; the ranking shares equal places", () => {
  assert.equal(behindPace(20, 15, 30), true); // 50% of the month gone → the line is 30%
  assert.equal(behindPace(35, 15, 30), false);
  assert.deepEqual(ranked([{ id: "a", percent: 40 }, { id: "b", percent: 90 }, { id: "c", percent: 40 }]).map((r) => [r.id, r.rank]), [["b", 1], ["a", 2], ["c", 2]]);
});

test("11.8 · Cairo months across the year, a stored deal as the rules read it, the TL tiers with «وأكتر»", () => {
  assert.deepEqual(monthBounds("2026-12"), { from: at("2026-11-30T22:00:00Z"), to: at("2026-12-31T22:00:00Z"), days: 31, prev: "2026-11" });
  assert.equal(monthBounds("2027-01").prev, "2026-12");
  const d = dealRowOf({ status: "PARTIALLY_COLLECTED", commissionOwner: "1000.00", commissionClient: "500.00", targetBase: null, offTarget: false,
    participants: [{ employeeId: "s1", side: "BUYER", approved: true }, { employeeId: "s2", side: "SELLER", approved: false }],
    payments: [{ side: "owner", amount: "250.50", receivedAt: at("2026-11-03T10:00:00Z") }] });
  assert.deepEqual([d.status, d.buyers, d.sellers, d.sellerApproved, d.payments[0]!.amount], ["Partially Collected", ["s1"], ["s2"], false, 25_050]);
  assert.deepEqual(tlTiersOf([{ below: 70, percent: 4 }, { below: null, percent: 6 }]), [{ below: 70, percent: 4 }, { below: Infinity, percent: 6 }]);
});
