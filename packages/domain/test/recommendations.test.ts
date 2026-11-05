import { test } from "node:test";
import assert from "node:assert/strict";
import { egp } from "../src/money.ts";
import {
  DEFAULT_RECOMMEND_TOLERANCE_PCT, deliveredBy, isGroundFloor, recommendUnits, spaceFit, spaceWindow,
  type ClientNeed, type RecommendableUnit,
} from "../src/recommendations.ts";

// The requirements' own cases (M-03 3.2 · 7.1); the ±20% is the proposed tolerance (needs-client, a setting).
const TOL = DEFAULT_RECOMMEND_TOLERANCE_PCT;

const unit = (o: Partial<RecommendableUnit> & { id: string }): RecommendableUnit => ({
  type: "Rent", alsoType: null, status: "available", alsoStatus: null, project: "Cairo Festival City", area: "التجمع الخامس",
  space: 100, condition: "متشطب", floor: "3", parking: 0, pricePerSqm: egp(1_000), divisible: false, minSplit: null,
  paymentMethod: null, delivery: null, ...o,
});

/** M-03 7.1: «كلاينت محتاج 100 متر متشطبة والبادجت 120,000». */
const client: ClientNeed = { type: "Rent", space: 100, condition: "متشطب", budget: egp(120_000), area: "التجمع الخامس" };
const ids = (r: { unit: { id: string } }[]) => r.map((x) => x.unit.id).sort();

test("M-03 7.1 · 100 m finished, budget 120,000: near 100 m (±20%), finished, within the budget", () => {
  const units = [
    unit({ id: "fits-100", space: 100, pricePerSqm: egp(1_100) }), // 110,000 a month
    unit({ id: "fits-80", space: 80, pricePerSqm: egp(1_500) }), // 80 is 100 − 20%: 120,000
    unit({ id: "fits-120", space: 120, pricePerSqm: egp(1_200) }), // 120 is 100 + 20%: 144,000 = 120,000 + 20%
    unit({ id: "too-small", space: 79 }),
    unit({ id: "too-big", space: 121 }),
    unit({ id: "not-finished", condition: "Core & Shell" }),
    unit({ id: "over-budget", space: 110, pricePerSqm: egp(1_310) }), // 144,100 > 144,000
    unit({ id: "resale", type: "Resale", pricePerSqm: egp(30_000) }),
    unit({ id: "rented", status: "rented" }),
  ];
  assert.deepEqual(ids(recommendUnits(client, units, {}, TOL)), ["fits-100", "fits-120", "fits-80"]);
});

test("M-03 7.1 · a 5000 m unit marked «تنفع تتقسم» shows for a 100 m client, priced on 100 m, with the split note", () => {
  const big = unit({ id: "U-5000", space: 5_000, divisible: true, minSplit: 100, pricePerSqm: egp(1_000) });
  const [r] = recommendUnits(client, [big], {}, TOL);
  assert.ok(r);
  assert.equal(r.split, true);
  assert.equal(r.price, egp(100_000)); // Q20: the price is worked out on the space the client needs
  // not divisible, or its smallest part is bigger than the client needs: not suggested
  assert.equal(recommendUnits(client, [{ ...big, divisible: false }], {}, TOL).length, 0);
  assert.equal(recommendUnits(client, [{ ...big, minSplit: 200 }], {}, TOL).length, 0);
  // «مش عايز مساحة متقسمة»
  assert.equal(recommendUnits(client, [big], { split: "no" }, TOL).length, 0);
});

test("M-03 7.1 · 40 suggestions, the client wants the ground floor and parking 2: only those stay", () => {
  const units = Array.from({ length: 40 }, (_, i) => unit({ id: `U-${100 + i}`, floor: i % 4 === 0 ? "G" : String(1 + (i % 5)), parking: i % 3 }));
  assert.equal(recommendUnits(client, units, {}, TOL).length, 40);
  const narrowed = recommendUnits(client, units, { floor: "ground", parking: 2 }, TOL);
  assert.ok(narrowed.length > 0 && narrowed.length < 40);
  assert.ok(narrowed.every((r) => isGroundFloor(r.unit.floor) && r.unit.parking >= 2));
  assert.deepEqual(ids(narrowed), ids(recommendUnits(client, units.filter((u) => u.floor === "G" && u.parking >= 2), {}, TOL)));
});

test("Rent compares the budget with a month's rent, Resale with the total price (M-03 7.2, proposed)", () => {
  const resale: ClientNeed = { type: "Resale", space: 100, condition: null, budget: egp(3_000_000), area: "الشيخ زايد" };
  const units = [
    unit({ id: "in", type: "Resale", pricePerSqm: egp(36_000) }), // 3,600,000 = budget + 20%
    unit({ id: "out", type: "Resale", pricePerSqm: egp(36_001) }),
  ];
  assert.deepEqual(ids(recommendUnits(resale, units, {}, TOL)), ["in"]);
});

test("the tolerance is the setting's: at 10% an 85 m unit is no longer near 100 m", () => {
  assert.equal(spaceFit(unit({ id: "a", space: 85 }), 100, 20), "fits");
  assert.equal(spaceFit(unit({ id: "a", space: 85 }), 100, 10), null);
  assert.deepEqual(spaceWindow(100, 20), { min: 80, max: 120 });
  assert.deepEqual(spaceWindow(55, 20), { min: 44, max: 66 });
  assert.throws(() => recommendUnits(client, [], {}, -1));
});

test("a dual unit is suggested through its second type when that side is still open (Q17)", () => {
  const dual = unit({ id: "dual", type: "Resale", alsoType: "Rent", status: "sold", alsoStatus: "available", pricePerSqm: egp(30_000) });
  const [r] = recommendUnits(client, [dual], {}, TOL);
  assert.ok(r);
  assert.equal(r.price, null); // its price per m² is the sale price, not a rent: no rent price to show or compare
  assert.equal(recommendUnits(client, [{ ...dual, alsoStatus: "rented" }], {}, TOL).length, 0);
});

test("the best match first: same area, then the space within range, then within the budget itself", () => {
  const units = [
    unit({ id: "other-area", area: "المعادي" }),
    unit({ id: "same-area", pricePerSqm: egp(1_100) }),
    unit({ id: "split", space: 900, divisible: true }),
    unit({ id: "over-budget-a-bit", pricePerSqm: egp(1_300) }), // 130,000: within +20%, over the budget itself
  ];
  const r = recommendUnits(client, units, {}, TOL);
  assert.deepEqual(r.map((x) => x.unit.id), ["same-area", "over-budget-a-bit", "split", "other-area"]);
  assert.deepEqual(r.map((x) => x.match), [95, 90, 85, 80]);
  assert.equal(r[0]!.sameArea, true);
  assert.equal(r[3]!.sameArea, false);
});

test("a lead without a space, finishing or budget isn't narrowed by them", () => {
  const open: ClientNeed = { type: "Rent", space: null, condition: null, budget: null, area: "التجمع الخامس" };
  const units = [unit({ id: "a", space: 40 }), unit({ id: "b", space: 3_000, condition: "Core & Shell", pricePerSqm: egp(9_000) })];
  assert.deepEqual(ids(recommendUnits(open, units, {}, TOL)), ["a", "b"]);
});

test("the other questions: project, same area, payment method, delivery date", () => {
  const units = [
    unit({ id: "festival", project: "Cairo Festival City" }),
    unit({ id: "mivida", project: "Mivida", area: "المعادي", paymentMethod: "كاش", delivery: "2027-06-01" }),
    unit({ id: "now", project: "Mivida", paymentMethod: "تقسيط 5 سنين", delivery: "فوري" }),
  ];
  assert.deepEqual(ids(recommendUnits(client, units, { project: "Mivida" }, TOL)), ["mivida", "now"]);
  assert.deepEqual(ids(recommendUnits(client, units, { area: "same" }, TOL)), ["festival", "now"]);
  // a unit that doesn't say how it's paid isn't ruled out
  assert.deepEqual(ids(recommendUnits(client, units, { payment: "كاش" }, TOL)), ["festival", "mivida"]);
  assert.deepEqual(ids(recommendUnits(client, units, { deliveryBy: "2027-01-01" }, TOL)), ["festival", "now"]);
  assert.equal(deliveredBy("2027-06-01", "2027-06-01"), true);
  assert.equal(isGroundFloor("أرضي"), true);
  assert.equal(isGroundFloor("1"), false);
  assert.equal(isGroundFloor(null), false);
});
