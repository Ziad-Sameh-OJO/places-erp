import { test } from "node:test";
import assert from "node:assert/strict";
import { egp, fromDecimal, toDecimal } from "../src/money.ts";
import { TEAM_TASKS_PER_DAY, asksForLists, locationUrl, unconfirmedUnits, fillsUnitFolder, UNIT_SHEET_FIELDS, carrySides, missingFields, seesMissingOf, inventoryReportText, mediaOnTime, teamTaskRoom, closedStatus, confirmsClose, incomeFigures, isStale, photoOrder, sideFor, sideOpen, splitPrice, staleBefore, unitTotal } from "../src/units.ts";

// The numbers are the client-approved demo's units (demo/design-2/js/data.js) and the requirements' examples (M-03 7.1).

test("total price = price per m² × gross area (M-03 3.2) · U-101: 95 m × 1,100 = 104,500 a month", () => {
  assert.equal(unitTotal(egp(1_100), 95), egp(104_500));
  // Resale U-201: 85 m × 36,000 = 3,060,000
  assert.equal(unitTotal(egp(36_000), 85), egp(3_060_000));
  // piasters stay exact: 1,050.50 × 3 = 3,151.50 (a float would give 3151.4999…)
  assert.equal(unitTotal(fromDecimal("1050.50"), 3), egp(3_151.5));
});

test("unitTotal refuses areas and prices the sheet can't hold", () => {
  assert.throws(() => unitTotal(egp(100), 0));
  assert.throws(() => unitTotal(egp(100), 12.5));
  assert.throws(() => unitTotal(-1, 10));
  assert.throws(() => unitTotal(10.5, 10));
});

test("Income (M-03 7.2): U-301 · 250 m, sale 36,000/m, lease 270/m → monthly 67,500 · annual 810,000 · yield 9%", () => {
  const f = incomeFigures({ salePerSqm: egp(36_000), leasePerSqm: egp(270), area: 250 });
  assert.equal(f.saleTotal, egp(9_000_000));
  assert.equal(f.monthlyRent, egp(67_500));
  assert.equal(f.annualRent, egp(810_000)); // monthly × 12
  assert.equal(f.yieldPct, 9); // annual ÷ sale total × 100
});

test("Income: U-302 · 180 m, sale 48,000/m, lease 360/m → yield 9% · U-303 → 9% · odd figures round to 2 decimals", () => {
  assert.equal(incomeFigures({ salePerSqm: egp(48_000), leasePerSqm: egp(360), area: 180 }).yieldPct, 9);
  assert.equal(incomeFigures({ salePerSqm: egp(40_000), leasePerSqm: egp(300), area: 220 }).yieldPct, 9);
  // 12 × 100 ÷ 7,000 × 100 = 17.142857… → 17.14
  assert.equal(incomeFigures({ salePerSqm: egp(7_000), leasePerSqm: egp(100), area: 1 }).yieldPct, 17.14);
});

test("Income without a sale price has no yield (nothing to divide by)", () => {
  const f = incomeFigures({ salePerSqm: 0, leasePerSqm: egp(270), area: 250 });
  assert.equal(f.yieldPct, null);
  assert.equal(f.annualRent, egp(810_000));
});

test("divisible unit (Q20): priced for the area the client needs · U-108 1,800 m at 850/m, from 90 m → 100 m = 85,000", () => {
  const u108 = { divisible: true, minSplit: 90, space: 1_800, pricePerSqm: egp(850) };
  assert.deepEqual(splitPrice(u108, 100), { ok: true, area: 100, price: egp(85_000) });
  assert.deepEqual(splitPrice(u108, 90), { ok: true, area: 90, price: egp(76_500) }); // exactly the minimum is fine
  assert.deepEqual(splitPrice(u108, 89), { ok: false, reason: "below-minimum" });
  assert.deepEqual(splitPrice(u108, 1_800), { ok: true, area: 1_800, price: unitTotal(egp(850), 1_800) });
  assert.deepEqual(splitPrice(u108, 1_801), { ok: false, reason: "above-space" });
});

test("divisible (M-03 7.1): the 5,000 m unit offered to a client who needs 100 m · no minimum set = any part", () => {
  assert.deepEqual(splitPrice({ divisible: true, minSplit: null, space: 5_000, pricePerSqm: egp(380) }, 100), { ok: true, area: 100, price: egp(38_000) });
  assert.deepEqual(splitPrice({ divisible: true, minSplit: 0, space: 5_000, pricePerSqm: egp(380) }, 1), { ok: true, area: 1, price: egp(380) });
});

test("a unit that isn't divisible is never priced in part", () => {
  assert.deepEqual(splitPrice({ divisible: false, minSplit: null, space: 150, pricePerSqm: egp(900) }, 100), { ok: false, reason: "not-divisible" });
  assert.throws(() => splitPrice({ divisible: true, minSplit: null, space: 150, pricePerSqm: egp(900) }, 0));
});

test("last update older than a month = late (M-03 2.4) · U-103 41 days late, U-101 3 days on time", () => {
  const now = new Date("2026-11-04T10:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  assert.equal(isStale(daysAgo(41), now), true);
  assert.equal(isStale(daysAgo(3), now), false);
  assert.equal(isStale(daysAgo(30), now), false); // exactly 30 days is still on time
  assert.equal(isStale(new Date(daysAgo(30).getTime() - 1), now), true);
  assert.deepEqual(staleBefore(now), daysAgo(30));
});

test("decimal strings ↔ piasters without floats", () => {
  assert.equal(fromDecimal("1100"), 110_000);
  assert.equal(fromDecimal("1100.5"), 110_050);
  assert.equal(fromDecimal("1100.50"), 110_050);
  assert.equal(fromDecimal("0.07"), 7);
  assert.equal(fromDecimal("-12.30"), -1_230);
  assert.equal(fromDecimal("-0"), 0);
  assert.equal(fromDecimal("999999999999.99"), 99_999_999_999_999); // Decimal(14,2)'s largest
  for (const bad of ["", "1.234", "1,000", "abc", "1e3", ".5"]) assert.throws(() => fromDecimal(bad), RangeError, bad);
  assert.equal(toDecimal(110_050), "1100.50");
  assert.equal(toDecimal(7), "0.07");
  assert.equal(toDecimal(-1_230), "-12.30");
  assert.equal(toDecimal(0), "0.00");
  assert.throws(() => toDecimal(1.5));
  for (const s of ["0.01", "104500.00", "9000000.00", "36000.99"]) assert.equal(toDecimal(fromDecimal(s)), s);
});

test("drafts and owners' numbers stay with who keeps the inventory (Q15, Q18): Manar / Randa yes, sales no", async () => {
  const { keepsInventory } = await import("../src/units.ts");
  const grants = (actions: string[]) => ({ can: (m: string, a: string) => m === "inventory" && actions.includes(a) });
  assert.equal(keepsInventory(grants(["view", "create", "edit", "approve", "delete"])), true); // Manar
  assert.equal(keepsInventory(grants(["view", "create", "edit"])), true); // Randa
  assert.equal(keepsInventory(grants(["view"])), false); // sales, marketing
  assert.equal(keepsInventory(grants(["view", "export"])), false); // Operations Head
});

test("area tabs (M-03 7.2): the sheet's names and the unit's tab — picked by Manar, otherwise by its area", async () => {
  const { areaTabLabel, areaRangeProblem, sortAreaTabs, unitAreaTab } = await import("../src/units.ts");
  const tabs = [
    { id: "c", min: 201, max: 500 }, { id: "a", min: 20, max: 100 }, { id: "b", min: 101, max: 200 },
    { id: "e", min: 801, max: null }, { id: "d", min: 501, max: 800 },
  ];
  assert.deepEqual(sortAreaTabs(tabs).map(areaTabLabel), ["20 to 100", "101 to 200", "201 to 500", "501 to 800", "+800"]);
  assert.equal(unitAreaTab({ space: 95, areaTabId: null }, tabs)?.id, "a"); // U-101
  assert.equal(unitAreaTab({ space: 100, areaTabId: null }, tabs)?.id, "a"); // both ends included
  assert.equal(unitAreaTab({ space: 101, areaTabId: null }, tabs)?.id, "b");
  assert.equal(unitAreaTab({ space: 5000, areaTabId: null }, tabs)?.id, "e"); // U-107
  assert.equal(unitAreaTab({ space: 10, areaTabId: null }, tabs), null); // below every tab
  assert.equal(unitAreaTab({ space: 95, areaTabId: "c" }, tabs)?.id, "c"); // Manar chose where it goes
  assert.equal(unitAreaTab({ space: 95, areaTabId: "deleted" }, tabs)?.id, "a"); // a removed tab falls back to the area
  // overlapping ranges: the narrower one with the same start wins, then the earlier start
  assert.equal(unitAreaTab({ space: 150, areaTabId: null }, [{ id: "wide", min: 101, max: 500 }, { id: "narrow", min: 101, max: 200 }])?.id, "narrow");
  assert.equal(areaRangeProblem({ min: 101, max: 200 }), null);
  assert.equal(areaRangeProblem({ min: 801, max: null }), null);
  assert.match(areaRangeProblem({ min: 200, max: 100 })!, /لحد/);
  assert.match(areaRangeProblem({ min: 0, max: 100 })!, /من/);
  assert.match(areaRangeProblem({ min: 1.5, max: 100 })!, /من/);
});

test("a unit's amounts must fit the sheet's money columns (999,999,999,999.99)", async () => {
  const { unitFiguresFit, MAX_MONEY } = await import("../src/units.ts");
  assert.equal(unitFiguresFit({ pricePerSqm: egp(1_100), leasePerSqm: null, area: 95 }), true);
  assert.equal(unitFiguresFit({ pricePerSqm: egp(9_999_999.99), leasePerSqm: null, area: 100_000 }), true); // 999,999,999,000
  assert.equal(unitFiguresFit({ pricePerSqm: egp(99_999_999), leasePerSqm: null, area: 1_000_000 }), false);
  // Income: a year's rent too (lease × area × 12)
  assert.equal(unitFiguresFit({ pricePerSqm: egp(36_000), leasePerSqm: egp(99_999_999_999), area: 900_000 }), false);
  assert.equal(unitFiguresFit({ pricePerSqm: null, leasePerSqm: null, area: 10 }), true);
  assert.equal(MAX_MONEY, fromDecimal("999999999999.99"));
});

// 2.9 · closing a unit after a Done Deal (M-03 Q16, Q17). The units are the demo's: U-103 is Rent and Resale at once.
const u103 = { type: "Rent", status: "available", alsoType: "Resale", alsoStatus: "available" } as const;

test("Q16: a rent deal leaves the unit Rented; a resale or income one Sold", () => {
  assert.equal(closedStatus("Rent"), "rented");
  assert.equal(closedStatus("Resale"), "sold");
  assert.equal(closedStatus("Income"), "sold");
  assert.equal(closedStatus("Primary"), "sold");
});

test("Q17: U-103 (Rent + Resale) — each deal closes its own side, a type the unit isn't on closes nothing", () => {
  assert.equal(sideFor(u103, "Rent"), "type");
  assert.equal(sideFor(u103, "Resale"), "also");
  assert.equal(sideFor(u103, "Income"), null);
  assert.equal(sideFor({ ...u103, alsoType: null, alsoStatus: null }, "Resale"), null);
});

test("Q17: once the rent side of U-103 is rented, its resale side is still open (and the other way round)", () => {
  const rented = { ...u103, status: "rented" } as const;
  assert.equal(sideOpen(rented, "type"), false);
  assert.equal(sideOpen(rented, "also"), true);
  const sold = { ...u103, alsoStatus: "sold" } as const;
  assert.equal(sideOpen(sold, "type"), true);
  assert.equal(sideOpen(sold, "also"), false);
});

test("Q16: Manar confirms closing a rent unit, Randa a resale / income one, the Super Admin either", () => {
  assert.equal(confirmsClose(["inventory"], "Rent"), true);
  assert.equal(confirmsClose(["inventory"], "Resale"), false);
  assert.equal(confirmsClose(["resale"], "Resale"), true);
  assert.equal(confirmsClose(["resale"], "Income"), true);
  assert.equal(confirmsClose(["resale"], "Rent"), false);
  assert.equal(confirmsClose(["admin"], "Income"), true);
  assert.equal(confirmsClose(["inventory_staff", "sales"], "Rent"), false);
});

test("Q17: editing U-103's second type keeps each side's state, a new side starts open", () => {
  const rented = { ...u103, status: "rented" } as const;
  assert.deepEqual(carrySides(rented, { type: "Rent", alsoType: "Resale" }), { status: "rented", alsoStatus: "available" });
  // Manar takes Resale off: only the rented Rent side is left
  assert.deepEqual(carrySides(rented, { type: "Rent", alsoType: null }), { status: "rented", alsoStatus: null });
  // swapped: Resale first, the rented Rent side second
  assert.deepEqual(carrySides(rented, { type: "Resale", alsoType: "Rent" }), { status: "available", alsoStatus: "rented" });
  // a one-type unit gets a second type
  assert.deepEqual(carrySides({ type: "Rent", status: "available", alsoType: null, alsoStatus: null }, { type: "Rent", alsoType: "Resale" }), { status: "available", alsoStatus: "available" });
});

test("2.8 · 2.23 · the PDF / slide show the unit, never its owner, agent or commission (M-03 1.2); each type its own rows", () => {
  for (const type of ["Rent", "Resale", "Income", "Primary"] as const) {
    const keys = UNIT_SHEET_FIELDS[type].map(([k]) => k);
    for (const hidden of ["ownerName", "ownerPhone", "agent", "commission", "link"]) assert.ok(!keys.includes(hidden), `${type} shows ${hidden}`);
    assert.ok(keys.includes("space") && keys.includes("pricePerSqm"));
  }
  // the client's slide (P1901) without its Commission row: 13 rows, the rent rate per meter (no total)
  assert.deepEqual(UNIT_SHEET_FIELDS.Rent.map(([, l]) => l), ["Building", "Delivery date", "Gross area", "Hand over Condition", "Rent rate per meter", "Maintenance", "Parking slots",
    "Upfront rent", "Security deposit", "Payment", "Term", "Grace period", "Annual increase"]);
  for (const k of ["total", "monthly", "annual", "yield", "tenant", "contractDuration"]) assert.ok(UNIT_SHEET_FIELDS.Income.some(([x]) => x === k), k);
  assert.ok(UNIT_SHEET_FIELDS.Resale.some(([x]) => x === "total"));
});

test("2.18 · the daily report's line: new / updated / rented / unconfirmed, in the demo's words", () => {
  assert.equal(inventoryReportText({ newUnits: 2, updated: 5, closed: 1, unconfirmed: 3 }), "التقرير اليومي للانفنتوري: جديد 2 · متحدّث 5 · اتأجر / اتباع 1 · مش مؤكد 3");
});

test("2.16 · Manar gives each one at most 30 tasks a day (M-03 3.1 KPI)", () => {
  assert.equal(TEAM_TASKS_PER_DAY, 30);
  assert.equal(teamTaskRoom(0), 30);
  assert.equal(teamTaskRoom(29), 1);
  assert.equal(teamTaskRoom(30), 0);
  assert.equal(teamTaskRoom(31), 0);
});

test("2.16 · Sara's upload counts on time within 24 hours of the unit being entered", () => {
  const entered = new Date("2026-11-04T10:00:00Z");
  assert.equal(mediaOnTime(entered, new Date("2026-11-05T10:00:00Z")), true, "exactly 24h");
  assert.equal(mediaOnTime(entered, new Date("2026-11-05T10:01:00Z")), false);
  assert.equal(mediaOnTime(entered, new Date("2026-11-04T12:00:00Z")), true);
});

test("2.4 · photo order: the same photos, each once, in the new order; the first is the main one", () => {
  assert.deepEqual(photoOrder(["a", "b", "c"], ["c", "a", "b"]), ["c", "a", "b"]);
  assert.equal(photoOrder(["a", "b", "c"], ["c", "a"]), null, "one left out");
  assert.equal(photoOrder(["a", "b"], ["a", "b", "x"]), null, "one that isn't the unit's");
  assert.equal(photoOrder(["a", "b"], ["a", "a"]), null, "twice");
  assert.deepEqual(photoOrder([], []), []);
});

test("2.20 · 2.21 · a Rent unit saved with the project only misses 10 columns, in the client's sheet order", () => {
  const miss = missingFields({ type: "Rent", photoCount: 0, project: "Mivida", area: "", space: 0, condition: "", parking: 0, floor: null, layout: false, comment: null });
  assert.deepEqual(miss, ["Pic & Info", "Area", "Conditions", "Price/Sqm", "Maintenance", "Commission", "Building Number", "Location", "Contact", "Number"]);
  assert.ok(missingFields({ type: "Rent", photoCount: 0, project: "" }).includes("Project"));
});

test("2.20 · optional and computed columns never count; a filled column drops off; the photos count by the folder", () => {
  const full = {
    type: "Rent" as const, photoCount: 3, project: "Mivida", ownerName: "Owner", ownerPhone: "01000000000", space: 95, condition: "Core & shell",
    pricePerSqm: "1100.00", maintenance: "10%", commission: "1 month", building: "B12", location: "30.02, 31.48", floor: null, parking: 0, totalPrice: null,
  };
  assert.deepEqual(missingFields(full), []);
  assert.deepEqual(missingFields({ ...full, photoCount: 0, maintenance: "" }), ["Pic & Info", "Maintenance"]);
  // Resale's delivery and Income's contract live in `details`
  assert.deepEqual(missingFields({ ...full, type: "Resale", paymentMethod: "Cash", details: {} }), ["Delivery date"]);
  const income = missingFields({ ...full, type: "Income", leasePerSqm: "270.00", details: { link: "x" } });
  assert.ok(income.includes("Tenant") && !income.includes("اللينك"));
});

test("2.20 · Manar gets the Rent units' alerts, Randa Resale and Income, the admin all", () => {
  assert.ok(seesMissingOf(["inventory"], "Rent") && !seesMissingOf(["inventory"], "Resale"));
  assert.ok(seesMissingOf(["resale"], "Income") && seesMissingOf(["resale"], "Resale") && !seesMissingOf(["resale"], "Rent"));
  assert.ok(seesMissingOf(["admin"], "Rent") && !seesMissingOf(["sales"], "Rent"));
});

test("2.22: Manar, Randa and Sara / Marwa fill the Pic & Info folder; the sales only open and download it", () => {
  const g = (...can: string[]) => ({ can: (m: string, a: string) => can.includes(`${m}.${a}`) });
  assert.equal(fillsUnitFolder(["inventory"], g("inventory.view", "inventory.edit")), true);
  assert.equal(fillsUnitFolder(["resale"], g("inventory.view", "inventory.create")), true);
  assert.equal(fillsUnitFolder(["inventory_staff"], g("inventory.view")), true);
  assert.equal(fillsUnitFolder(["sales"], g("inventory.view")), false);
});

test("Lists (M-12 Marwa): a Team Leader asks, sales don't; a unit 41 days without an update is «مش مؤكدة»", () => {
  const can = (...g: string[]) => ({ can: (m: string, a: string) => g.includes(`${m}:${a}`) });
  assert.equal(asksForLists(["tl"], can("tickets:create")), true);
  assert.equal(asksForLists(["sales"], can("tickets:create")), false);
  assert.equal(asksForLists(["admin"], can("tickets:approve")), true);
  const now = new Date("2026-11-08T10:00:00Z"), daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  // U-101 updated 3 days ago, U-104 41 days ago (demo data.js): only U-104 counts against the List
  assert.deepEqual(unconfirmedUnits([{ code: "U-101", lastOwnerUpdateAt: daysAgo(3) }, { code: "U-104", lastOwnerUpdateAt: daysAgo(41) }], now), ["U-104"]);
  assert.deepEqual(unconfirmedUnits([], now), []);
});

test("2.34 · Location is a Google Maps link; an old «lat, lng» opens as a search for the point", () => {
  assert.equal(locationUrl("https://maps.app.goo.gl/abc123"), "https://maps.app.goo.gl/abc123");
  assert.equal(locationUrl("  http://maps.google.com/?q=30.1,31.4 "), "http://maps.google.com/?q=30.1,31.4");
  assert.equal(locationUrl("30.02541, 31.49130"), "https://maps.google.com/?q=30.02541%2C%2031.49130");
  assert.equal(locationUrl(""), "");
  assert.equal(locationUrl(null), "");
});
