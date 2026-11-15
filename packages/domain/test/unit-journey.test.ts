import { test } from "node:test";
import assert from "node:assert/strict";
import { JOURNEY_STAGES, unitJourney, visitedFirst } from "../src/unit-journey.ts";

test("14.8 · List → Visits → Short list → Meeting, each stage oldest first, empty stages kept", () => {
  const j = unitJourney([
    { stage: "visit", at: "2026-11-10T10:00:00Z", id: "v2" },
    { stage: "list", at: "2026-11-02T09:00:00Z", id: "l1" },
    { stage: "visit", at: "2026-11-05T10:00:00Z", id: "v1" },
    { stage: "list", at: "2026-11-08T09:00:00Z", id: "l2" },
  ]);
  assert.deepEqual(j.map((s) => s.stage), [...JOURNEY_STAGES]);
  assert.deepEqual(j.map((s) => s.steps.map((x) => x.id)), [["l1", "l2"], ["v1", "v2"], [], []]);
});

test("14.11 · visited units come first and are marked, the rest keep their order", () => {
  const r = visitedFirst([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], new Set(["c", "x"]));
  assert.deepEqual(r.map((u) => `${u.id}${u.visited ? "*" : ""}`), ["c*", "a", "b", "d"]);
});
