import { test } from "node:test";
import assert from "node:assert/strict";
import { MAIL_MAX_ATTEMPTS, afterMailFailure, channelsFor, eventByKey, mailStatus } from "../src/notifications.ts";

const now = new Date("2026-11-05T09:00:00Z");

test("a failed email is tried again 5 minutes later, and after the 3rd try it's «الإيميل فشل» (M-14 2.3 · 2.4)", () => {
  assert.deepEqual(afterMailFailure(1, now), { status: "queued", nextAttemptAt: new Date("2026-11-05T09:05:00Z") });
  assert.deepEqual(afterMailFailure(2, now), { status: "queued", nextAttemptAt: new Date("2026-11-05T09:05:00Z") });
  assert.deepEqual(afterMailFailure(MAIL_MAX_ATTEMPTS, now), { status: "failed" });
});

test("the send log: sent, then «اتقرا» once its in-app copy is opened; failed stays failed (M-14 3.3)", () => {
  assert.equal(mailStatus("sent", null), "sent");
  assert.equal(mailStatus("sent", now), "read");
  assert.equal(mailStatus("failed", now), "failed");
  assert.equal(mailStatus("queued", null), "queued");
});

test("push follows the rule, not the email preference (M-14 · 51)", () => {
  assert.deepEqual(channelsFor(["app", "push", "email"], { emailNotifications: false }, false), ["app", "push"]);
  assert.deepEqual(channelsFor(eventByKey("lead.assigned")!.channels, { emailNotifications: true }, false), ["app", "push"]);
});

test("the Super Admin hears of a failed email in the system only, never by email (M-14 7.1)", () => {
  const e = eventByKey("mail.failed")!;
  assert.deepEqual(e.toRoles, ["admin"]);
  assert.deepEqual(channelsFor(e.channels, { emailNotifications: true }, e.important), ["app"]);
});
