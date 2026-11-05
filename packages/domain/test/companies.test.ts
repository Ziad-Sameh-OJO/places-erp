import { test } from "node:test";
import assert from "node:assert/strict";
import { keepsCompaniesSheet } from "../src/companies.ts";

test("M-01 2.1: Telesales (and the admin) add to the companies sheet; a salesperson or Operations don't", () => {
  assert.equal(keepsCompaniesSheet(["telesales"]), true);
  assert.equal(keepsCompaniesSheet(["admin"]), true);
  assert.equal(keepsCompaniesSheet(["sales"]), false);
  assert.equal(keepsCompaniesSheet(["ops"]), false);
});
