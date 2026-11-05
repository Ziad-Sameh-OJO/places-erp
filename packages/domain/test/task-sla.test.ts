import { test } from "node:test";
import assert from "node:assert/strict";
import { type SlaTask, taskSla, taskSlaDue, taskSlaReport } from "../src/task-sla.ts";

const at = (iso: string) => new Date(iso);
const task = (t: Partial<SlaTask>): SlaTask => ({ kind: "photo", status: "todo", createdAt: at("2026-11-08T10:00:00Z"), doneAt: null, returned: 0, unitEnteredAt: null, ...t });

test("a shoot is due 72 hours after the unit was registered, not after the task was given (M-12 Bayoumi 1)", () => {
  const t = task({ unitEnteredAt: at("2026-11-07T09:00:00Z"), createdAt: at("2026-11-09T09:00:00Z") });
  assert.deepEqual(taskSlaDue(t), at("2026-11-10T09:00:00Z"));
  assert.equal(taskSla(t, at("2026-11-10T07:00:00Z"))!.hoursLeft, 2);
  assert.equal(taskSla(t, at("2026-11-10T07:00:00Z"))!.met, null); // not delivered yet
  assert.equal(taskSla(t, at("2026-11-10T12:00:00Z"))!.hoursLeft, -3); // late
  assert.equal(taskSla({ ...t, status: "done", doneAt: at("2026-11-10T08:59:00Z") }, at("2026-11-20T00:00:00Z"))!.met, true);
  assert.equal(taskSla({ ...t, status: "done", doneAt: at("2026-11-10T09:01:00Z") }, at("2026-11-20T00:00:00Z"))!.met, false);
});

test("a Retouch is due 48 hours after it was given (M-12 Bayoumi 2 · Rahma 6); other kinds have no SLA", () => {
  const t = task({ kind: "retouch", createdAt: at("2026-11-08T10:00:00Z") });
  assert.deepEqual(taskSlaDue(t), at("2026-11-10T10:00:00Z"));
  assert.equal(taskSlaDue(task({ kind: "marketing" })), null);
  assert.equal(taskSla(task({ kind: "followup" }), at("2026-11-08T10:00:00Z")), null);
});

test("M-12 7.1: Bayoumi shot 8 of 10 new units within 72 hours → 80%; Retouch accepted the first time", () => {
  const entered = at("2026-11-01T09:00:00Z");
  const shoots = Array.from({ length: 10 }, (_, i) =>
    task({ unitEnteredAt: entered, status: "done", doneAt: new Date(entered.getTime() + (i < 8 ? 70 : 80) * 3_600_000) }));
  const retouch = [
    task({ kind: "retouch", status: "done", doneAt: at("2026-11-09T10:00:00Z"), returned: 0 }),
    task({ kind: "retouch", status: "done", doneAt: at("2026-11-11T10:00:00Z"), returned: 1 }), // sent back once, then late
    task({ kind: "retouch", status: "uploaded" }), // not approved yet: doesn't count
  ];
  const r = taskSlaReport([...shoots, ...retouch, task({ status: "todo", unitEnteredAt: entered })]);
  assert.deepEqual(r.photo, { total: 10, met: 8, percent: 80 });
  assert.deepEqual(r.retouch, { total: 2, met: 1, percent: 50 });
  assert.deepEqual(r.firstTime, { total: 2, met: 1, percent: 50 });
  assert.deepEqual(taskSlaReport([]).photo, { total: 0, met: 0, percent: null });
});
