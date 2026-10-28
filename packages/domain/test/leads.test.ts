import { test } from "node:test";
import assert from "node:assert/strict";
import { LeadRouter, distributeEvenly, isQualifiedAfter, leadSla } from "../src/leads.ts";

const cairo = (iso: string) => new Date(`${iso}+03:00`);
const fresh = (assignedAt: Date) => ({ stage: "Fresh" as const, touched: false, ownedByTelesales: false, assignedAt });

test("SLA: Team Leader warned after 2h30 of working time, lead pulled after 3h", () => {
  const at = cairo("2026-10-25T11:00:00");
  assert.equal(leadSla(fresh(at), cairo("2026-10-25T13:29:00"))?.level, "ok");
  assert.equal(leadSla(fresh(at), cairo("2026-10-25T13:30:00"))?.level, "warn");
  assert.equal(leadSla(fresh(at), cairo("2026-10-25T14:00:00"))?.level, "pull");
});

test("SLA: a lead that arrives after hours starts counting next working morning", () => {
  const at = cairo("2026-10-25T21:00:00");
  assert.equal(leadSla(fresh(at), cairo("2026-10-26T13:59:00"))?.level, "warn");
  assert.equal(leadSla(fresh(at), cairo("2026-10-26T14:00:00"))?.level, "pull");
});

test("SLA: on holidays it is wall-clock — warn after 22h, pull after 24h", () => {
  const at = cairo("2026-10-23T10:00:00");
  assert.equal(leadSla(fresh(at), cairo("2026-10-24T08:00:00"), { holidayMode: true })?.level, "warn");
  assert.equal(leadSla(fresh(at), cairo("2026-10-24T10:00:00"), { holidayMode: true })?.level, "pull");
});

test("SLA does not apply once the lead was touched or isn't Fresh", () => {
  const at = cairo("2026-10-25T11:00:00");
  assert.equal(leadSla({ ...fresh(at), touched: true }, cairo("2026-10-25T18:00:00")), null);
  assert.equal(leadSla({ ...fresh(at), stage: "Interested" }, cairo("2026-10-25T18:00:00")), null);
});

test("Qualified is sticky and Cancellation/Hold only count if already Interested", () => {
  assert.equal(isQualifiedAfter(false, "Interested"), true);
  assert.equal(isQualifiedAfter(true, "No Answer"), true);
  assert.equal(isQualifiedAfter(false, "Cancellation"), false);
  assert.equal(isQualifiedAfter(true, "Hold"), true);
});

test("routing is round-robin per area and a hand assignment uses up a turn", () => {
  const r = new LeadRouter();
  const pool = ["a", "b", "c"];
  assert.deepEqual([r.next("Zayed", pool), r.next("Zayed", pool), r.next("Zayed", pool), r.next("Zayed", pool)], ["a", "b", "c", "a"]);
  r.assignedByHand("b");
  assert.deepEqual([r.next("Zayed", pool), r.next("Zayed", pool)], ["c", "a"]); // b's turn skipped once
  assert.equal(r.next("Maadi", []), null);
});

test("bulk upload: 50 numbers over 17 salespeople → 16 get 3, one gets 2", () => {
  const people = Array.from({ length: 17 }, (_, i) => `s${i}`);
  const counts = [...distributeEvenly(50, people).values()];
  assert.equal(counts.filter((c) => c === 3).length, 16);
  assert.equal(counts.filter((c) => c === 2).length, 1);
});
