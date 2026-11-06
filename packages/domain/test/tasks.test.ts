import { test } from "node:test";
import assert from "node:assert/strict";
import { followupRole, isTaskLate, needsFollowup, photoDayWarning, taskKind, taskMove, taskMovesFor, type TaskActor } from "../src/tasks.ts";

const assignee: TaskActor = { assignee: true, manager: false, approver: false };
const manar: TaskActor = { assignee: false, manager: true, approver: true };
const stranger: TaskActor = { assignee: false, manager: false, approver: false };

test("the kinds and who they go to (M-04 1.2, 3.1): photo → the photographer, Retouch → a human designer or the photographer", () => {
  assert.deepEqual(taskKind("photo")!.assigneeRoles, ["photographer"]);
  assert.ok(taskKind("retouch")!.assigneeRoles.includes("designer"));
  assert.deepEqual(taskKind("photo")!.createdWith, { module: "inventory", action: "edit" }); // «منار / رندا (تصوير)»
  assert.deepEqual(taskKind("marketing")!.createdWith, { module: "marketing", action: "create" }); // «مدير التسويق (الباقي)»
  assert.equal(taskKind("followup")!.createdWith, null); // only the month job (M-03 2.4)
  assert.equal(taskKind("whatever"), undefined);
});

test("To Do → In Progress → Done by the assignee (M-04 3.3); a stranger can't move it", () => {
  assert.deepEqual(taskMove("photo", "todo", "progress", assignee), { ok: true, undo: false, returned: false });
  assert.equal(taskMove("photo", "progress", "done", assignee).ok, true);
  assert.equal(taskMove("photo", "todo", "done", assignee).ok, true);
  assert.equal(taskMove("photo", "todo", "progress", stranger).ok, false);
  assert.equal(taskMove("photo", "todo", "todo", assignee).ok, false);
});

test("M-04 7.1: a photographer pressed Done by mistake → Undo puts it back on the board", () => {
  assert.deepEqual(taskMove("photo", "done", "todo", assignee), { ok: true, undo: true, returned: false });
  assert.equal(taskMove("photo", "done", "progress", assignee).ok, false);
  assert.equal(taskMove("photo", "done", "todo", stranger).ok, false);
});

test("M-04 2.2: a Retouch is Done only with Manar's approval; refused → back to the designer, counted as returned", () => {
  const no = taskMove("retouch", "progress", "done", assignee);
  assert.equal(no.ok, false);
  assert.match(!no.ok ? no.reason : "", /موافقة منار/);
  assert.equal(taskMove("retouch", "progress", "uploaded", assignee).ok, true);
  assert.equal(taskMove("retouch", "uploaded", "done", assignee).ok, false);
  assert.deepEqual(taskMove("retouch", "uploaded", "done", manar), { ok: true, undo: false, returned: false });
  assert.deepEqual(taskMove("retouch", "uploaded", "todo", manar), { ok: true, undo: false, returned: true });
  assert.equal(taskMove("retouch", "uploaded", "progress", manar).ok, false);
  assert.equal(taskMove("retouch", "done", "todo", manar).ok, false); // approved: no Undo (demo)
  assert.equal(taskMove("photo", "todo", "uploaded", assignee).ok, false); // the lane is Retouch-only
});

test("the board's buttons follow the same rule", () => {
  assert.deepEqual(taskMovesFor("photo", "todo", assignee), ["progress", "done"]);
  assert.deepEqual(taskMovesFor("retouch", "progress", assignee), ["todo", "uploaded"]);
  assert.deepEqual(taskMovesFor("retouch", "uploaded", manar), ["todo", "done"]);
  assert.deepEqual(taskMovesFor("marketing", "done", assignee), ["todo"]);
  assert.deepEqual(taskMovesFor("photo", "todo", stranger), []);
});

test("M-03 2.4 · 2.17: a unit late on its owner update gets one follow-up — Randa for Resale, Manar for the rest", () => {
  assert.equal(followupRole("Resale"), "resale");
  assert.equal(followupRole("Rent"), "inventory");
  assert.equal(followupRole("Income"), "inventory");
  assert.equal(needsFollowup({ stale: true, openFollowup: false }), true);
  assert.equal(needsFollowup({ stale: true, openFollowup: true }), false); // still one open: no second
  assert.equal(needsFollowup({ stale: false, openFollowup: false }), false);
});

test("M-04 2.4: a daily task is late once its day has passed in Cairo, unless Done", () => {
  const now = new Date("2026-11-08T22:30:00Z"); // 9 Nov 00:30 in Cairo (UTC+2)
  assert.equal(isTaskLate({ status: "todo", dueOn: "2026-11-08" }, now), true);
  assert.equal(isTaskLate({ status: "todo", dueOn: "2026-11-09" }, now), false);
  assert.equal(isTaskLate({ status: "done", dueOn: "2026-11-01" }, now), false);
});

test("M-04 2.1 step 4 «وحدة في اليوم»: a second open photo task for the same day warns (demo tasks.js), it doesn't block", () => {
  assert.equal(photoDayWarning("photo", 0), null);
  assert.equal(photoDayWarning("photo", 1), "تنبيه: إنت مدياه وحدة النهارده قبل كده (وحدة في اليوم)");
  assert.equal(photoDayWarning("retouch", 3), null);
  assert.equal(photoDayWarning("marketing", 1), null);
});
