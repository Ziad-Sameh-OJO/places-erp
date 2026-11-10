import { test } from "node:test";
import assert from "node:assert/strict";
import { inboxOrder, renewalOnBoard, seesVisitsOnBoard, taskTone, visitDue } from "../src/my-day.ts";

const cairo = (iso: string) => new Date(`${iso}+02:00`);

test("a visit is on the board from its Cairo day: yesterday's is late, today's is due, tomorrow's isn't there yet (1.22)", () => {
  const now = cairo("2026-11-05T10:00:00");
  assert.equal(visitDue(cairo("2026-11-04T18:00:00"), now), "bad");
  assert.equal(visitDue(cairo("2026-11-05T18:00:00"), now), "");
  assert.equal(visitDue(cairo("2026-11-05T00:30:00"), now), ""); // 22:30 UTC the day before, but today in Cairo
  assert.equal(visitDue(cairo("2026-11-06T11:00:00"), now), null);
});

test("visits show on the board of sales, the TL and the admin; not Operations' (demo home.js)", () => {
  assert.equal(seesVisitsOnBoard(["sales"]), true);
  assert.equal(seesVisitsOnBoard(["tl"]), true);
  assert.equal(seesVisitsOnBoard(["ops"]), false);
  assert.equal(seesVisitsOnBoard(["telesales"]), false);
});

test("the late ones first, the rest keep their order", () => {
  const items = [{ id: 1, tone: "" as const }, { id: 2, tone: "bad" as const }, { id: 3, tone: "warn" as const }, { id: 4, tone: "bad" as const }];
  assert.deepEqual(inboxOrder(items).map((x) => x.id), [2, 4, 1, 3]);
});

test("a task of mine is red once its day has passed; due today or later is not late (0.18, demo home.js)", () => {
  assert.equal(taskTone("2026-11-09", "2026-11-10"), "bad");
  assert.equal(taskTone("2026-11-10", "2026-11-10"), "");
  assert.equal(taskTone("2026-11-12", "2026-11-10"), "");
});

test("a contract is on the home board from 30 days before its end until its last day (0.18, demo home.js)", () => {
  assert.equal(renewalOnBoard(30), true);
  assert.equal(renewalOnBoard(0), true);
  assert.equal(renewalOnBoard(31), false);
  assert.equal(renewalOnBoard(-1), false);
});
