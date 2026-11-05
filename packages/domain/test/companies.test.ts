import { test } from "node:test";
import assert from "node:assert/strict";
import { contractEndingWindow, keepsCompaniesSheet } from "../src/companies.ts";

test("M-01 2.1: Telesales (and the admin) add to the companies sheet; a salesperson or Operations don't", () => {
  assert.equal(keepsCompaniesSheet(["telesales"]), true);
  assert.equal(keepsCompaniesSheet(["admin"]), true);
  assert.equal(keepsCompaniesSheet(["sales"]), false);
  assert.equal(keepsCompaniesSheet(["ops"]), false);
});

test("1.21: the contract-ending report covers today to today + 90 days, both included (demo «خلال 90 يوم»)", () => {
  assert.deepEqual(contractEndingWindow("2026-11-05"), { from: "2026-11-05", to: "2027-02-03" });
  assert.deepEqual(contractEndingWindow("2026-12-31", 1), { from: "2026-12-31", to: "2027-01-01" });
});
