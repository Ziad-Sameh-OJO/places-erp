import { test } from "node:test";
import assert from "node:assert/strict";
import { accountEnded } from "../src/permissions.ts";
import { withoutFields } from "../src/fields.ts";

test("M-09 2.4: the account works through its last working day, Cairo time, and stops when the next Cairo day starts", () => {
  const last = new Date("2026-11-30T00:00:00Z"); // «آخر يوم شغل» 30/11 as the date input saves it
  assert.equal(accountEnded(null, new Date("2030-01-01T00:00:00Z")), false);
  assert.equal(accountEnded(last, new Date("2026-11-30T21:59:00Z")), false); // 23:59 Cairo (UTC+2) on the 30th
  assert.equal(accountEnded(last, new Date("2026-11-30T22:00:00Z")), true); // 00:00 Cairo on 1/12 — not 02:00
  assert.equal(accountEnded(new Date("2026-07-15T00:00:00Z"), new Date("2026-07-15T21:00:00Z")), true); // summer time (UTC+3)
  assert.equal(accountEnded(new Date("2026-07-15T00:00:00Z"), new Date("2026-07-15T20:59:00Z")), false);
});

test("M-09 field permissions in the Audit Log: hidden fields leave before / after at any depth", () => {
  const row = { salary: "9000.00", name: "x", lines: [{ salary: "1", note: "n" }], nested: { salary: 2, ok: true } };
  assert.deepEqual(withoutFields(row, new Set(["salary"])), { name: "x", lines: [{ note: "n" }], nested: { ok: true } });
  assert.equal(withoutFields(row, new Set()), row);
  assert.equal(withoutFields(null, new Set(["salary"])), null);
  assert.equal(withoutFields("text", new Set(["salary"])), "text");
});
