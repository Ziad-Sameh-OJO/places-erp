import { test } from "node:test";
import assert from "node:assert/strict";
import { MAIL_MAX_ATTEMPTS, afterMailFailure, channelsFor, eventByKey, eventChannels, eventLabel, mailStatus, pushRecipients } from "../src/notifications.ts";

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

test("the bell's type filter names every type the system writes, the worker's too (M-14 5.3 · 12.11)", () => {
  const written = ["hr.action_due", "kpi.mid_quarter", "hr.leave_request", "hr.leave_escalated", "mail.failed", "finance.payroll_due", "procurement.reminder", "finance.bill_due", "ticket.late", "lead.visit_due"];
  for (const k of written) assert.ok(eventByKey(k), k);
  assert.equal(eventLabel("lead.visit_due"), "Alarm ميعاد Visit / Meeting");
  assert.equal(eventLabel(null), "أخرى");
  assert.equal(eventLabel("gone.event"), "أخرى");
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

test("a job's notification reaches the phone exactly when the event's rule has push, whatever the email preference (M-14 · 51 · 12.10)", () => {
  const visit = eventByKey("lead.visit_due")!; // Alarm: app + push by default
  const people = [{ id: "u1", emailNotifications: true }, { id: "u2", emailNotifications: false }];
  assert.deepEqual(pushRecipients(eventChannels(visit, null), people, visit.important), ["u1", "u2"]);
  // the admin turned push off for the event in «قواعد الإشعارات»
  assert.deepEqual(eventChannels(visit, ["app"]), ["app"]);
  assert.deepEqual(pushRecipients(eventChannels(visit, ["app"]), people, visit.important), []);
  // payroll due is app + email only: no push
  const payroll = eventByKey("finance.payroll_due")!;
  assert.deepEqual(pushRecipients(eventChannels(payroll, undefined), people, payroll.important), []);
  // a lead rule's own channels (SLA warn: app + push + email)
  assert.deepEqual(pushRecipients(["app", "push", "email"], people, true), ["u1", "u2"]);
});
