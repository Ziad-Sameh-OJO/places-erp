import { test } from "node:test";
import assert from "node:assert/strict";
import { mergedFile, mergedKind, normalizePhone, partyBalance, showsNumbers, withRole } from "../src/clients.ts";
import { effectiveGrants } from "../src/permissions.ts";

test("owners' numbers (M-10 4.1): hidden from sales and finance, shown to inventory and Operations; a client's always", () => {
  const sales = effectiveGrants([{ scope: "own", modules: { clients: ["view", "create"], inventory: ["view"] } }]);
  const finance = effectiveGrants([{ scope: "all", modules: { clients: ["view"] } }]);
  const manar = effectiveGrants([{ scope: "dept", modules: { clients: ["view", "create", "edit"], inventory: ["view", "create", "edit"] } }]);
  const ops = effectiveGrants([{ scope: "all", modules: { clients: ["view", "create", "edit", "approve"] } }]);
  for (const kind of ["owner", "both"] as const) {
    assert.equal(showsNumbers(kind, sales), false);
    assert.equal(showsNumbers(kind, finance), false);
    assert.equal(showsNumbers(kind, manar), true);
    assert.equal(showsNumbers(kind, ops), true);
  }
  assert.equal(showsNumbers("client", sales), true);
});

test("merge (M-10 2.2): the kept file keeps its name, fills what it lacks, both roles, active if either, latest contact", () => {
  const jan = new Date("2026-01-10T10:00:00Z"), oct = new Date("2026-10-01T10:00:00Z");
  const m = mergedFile(
    { kind: "client", status: "inactive", company: null, preferredContact: "واتساب", lastContactAt: jan },
    { kind: "owner", status: "active", company: "شركة النيل", preferredContact: "مكالمة", lastContactAt: oct },
  );
  assert.deepEqual(m, { kind: "both", status: "active", company: "شركة النيل", preferredContact: "واتساب", lastContactAt: oct });
});
import { egp } from "../src/money.ts";

test("paid and remaining (M-10 3.2): each deal's due against what was paid on it; rejected / cancelled owe nothing", () => {
  // a client on two deals: 12,000 due, 5,000 paid · 8,000 due, 9,000 paid (overpaid: doesn't lower the other one)
  const b = partyBalance([
    { status: "Partially Collected", due: egp(12_000), paid: egp(5_000) },
    { status: "Fully Collected", due: egp(8_000), paid: egp(9_000) },
    { status: "Cancelled", due: egp(20_000), paid: 0 },
    { status: "Rejected", due: egp(1_000), paid: 0 },
  ]);
  assert.equal(b.paid, egp(14_000));
  assert.equal(b.remaining, egp(7_000));
  assert.deepEqual(partyBalance([]), { paid: 0, remaining: 0 });
});

// M-10 3.1: «الأرقام · أكتر من رقم، وبتمنع التكرار» · the card: «الموبايل unique بعد ما يتنضّف».

test("the same mobile written different ways is one number (M-10 3.1)", () => {
  for (const raw of ["01001234567", "0100 123 4567", "0100-123-4567", "+20 100 123 4567", "00201001234567", "201001234567", "(010) 0123-4567"]) {
    assert.equal(normalizePhone(raw), "01001234567", raw);
  }
});

test("landlines and numbers abroad stay as digits; junk is not a number", () => {
  assert.equal(normalizePhone("02 2735 1234"), "0227351234");
  assert.equal(normalizePhone("+971 50 123 4567"), "971501234567");
  assert.equal(normalizePhone("—"), null);
  assert.equal(normalizePhone("123"), null);
  assert.equal(normalizePhone("0100abc4567"), null);
});

test("a client who brings a unit becomes «client + owner» (M-10 3.1 النوع: عميل / مالك / الاتنين)", () => {
  assert.equal(withRole(null, "client"), "client");
  assert.equal(withRole(null, "owner"), "owner");
  assert.equal(withRole("client", "client"), "client");
  assert.equal(withRole("client", "owner"), "both");
  assert.equal(withRole("owner", "client"), "both");
  assert.equal(withRole("both", "owner"), "both");
});

test("merging two files keeps both roles (M-10 2.2)", () => {
  assert.equal(mergedKind("owner", "owner"), "owner");
  assert.equal(mergedKind("client", "owner"), "both");
  assert.equal(mergedKind("both", "client"), "both");
});
