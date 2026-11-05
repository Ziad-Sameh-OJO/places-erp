import { test } from "node:test";
import assert from "node:assert/strict";
import { postState, reminderDue, type PlannedPost } from "../src/posts.ts";

// 5 Nov 2026, Cairo = UTC+2: 19:00 Cairo = 17:00Z
const post = (p: Partial<PlannedPost>): PlannedPost => ({ at: new Date("2026-11-05T17:00:00Z"), approved: true, publishedAt: null, reminderSentAt: null, ...p });

test("M-04 7.1: a post today at 7 → the Reminder is due at 7, not before, and only once", () => {
  assert.equal(reminderDue(post({}), new Date("2026-11-05T16:59:00Z")), false);
  assert.equal(reminderDue(post({}), new Date("2026-11-05T17:00:00Z")), true);
  assert.equal(reminderDue(post({ reminderSentAt: new Date("2026-11-05T17:00:00Z") }), new Date("2026-11-05T17:05:00Z")), false);
  assert.equal(reminderDue(post({ publishedAt: new Date("2026-11-05T16:50:00Z") }), new Date("2026-11-05T17:00:00Z")), false); // already out
  assert.equal(reminderDue(post({ approved: false }), new Date("2026-11-05T17:00:00Z")), false); // still waiting for the manager (2.2)
});

test("the calendar's chips: published · waiting for approval · Reminder today (Cairo day) · scheduled", () => {
  const morning = new Date("2026-11-05T06:00:00Z");
  assert.equal(postState(post({}), morning), "today");
  assert.equal(postState(post({ at: new Date("2026-11-05T22:30:00Z") }), morning), "scheduled"); // 00:30 on the 6th in Cairo
  assert.equal(postState(post({ approved: false }), morning), "waiting");
  assert.equal(postState(post({ publishedAt: morning }), morning), "published");
});
