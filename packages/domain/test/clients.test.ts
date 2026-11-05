import { test } from "node:test";
import assert from "node:assert/strict";
import { mergedKind, normalizePhone, withRole } from "../src/clients.ts";

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
