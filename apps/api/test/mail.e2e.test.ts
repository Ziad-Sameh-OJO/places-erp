/**
 * 12.9 · M-14 2.3 · 2.4 · 3.3: every email lands in the send log; the worker sends the queued ones, retries a failure,
 * and after the last try marks it «الإيميل فشل» and tells the Super Admin in the system — once, however often it runs.
 * The log is the Super Admin's (integrations: edit); a salesperson gets 403.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { MAIL_RETRY_MINUTES } from "@places/domain";
import { call, session } from "./helpers.ts";
import { mailOutboxTick, type OutgoingMail } from "../../worker/src/processors/mail-outbox.ts";

const stamp = Date.now();
const good = `e2e-mail-ok-${stamp}@places.test`;
const bad = `e2e-mail-bad-${stamp}@places.test`;
let admin: string, sales: string, adminIds: string[];

before(async () => {
  [admin, sales] = await Promise.all([session("ahmed.islam@places.com"), session("m.mohsen@places.com")]);
  adminIds = (await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: "admin" } } } }, select: { id: true } })).map((u) => u.id);
});

after(async () => {
  const mine = { OR: [{ to: { endsWith: `${stamp}@places.test` } }, { subject: { contains: `E2E ${stamp}` } }] };
  const notes = (await prisma.mailLog.findMany({ where: mine, select: { notificationId: true } })).map((m) => m.notificationId).filter((x): x is string => !!x);
  await prisma.mailLog.deleteMany({ where: mine });
  await prisma.notification.deleteMany({ where: { OR: [{ id: { in: notes } }, { text: { contains: `E2E ${stamp}` } }] } });
  await prisma.$disconnect();
});

test("the send log is the Super Admin's: sales 403; an email the API sends shows as «اتبعت»", async () => {
  assert.equal((await call("/notifications/mail-log", { cookie: sales })).status, 403);
  assert.equal((await call("/auth/forgot", { method: "POST", body: { email: "m.mohsen@places.com" } })).status, 204);
  const log = await call("/notifications/mail-log?status=sent&pageSize=100", { cookie: admin });
  assert.equal(log.status, 200);
  const row = log.body.items.find((m: { to: string }) => m.to === "m.mohsen@places.com");
  assert.ok(row, "the reset email is in the log");
  assert.equal(row.status, "sent");
  assert.equal((await call("/notifications/mail-log?status=nonsense", { cookie: admin })).status, 400);
});

test("«اتقرا»: a sent email whose in-app copy was opened (M-14 3.1 · 3.3)", async () => {
  const salesId = (await prisma.user.findUniqueOrThrow({ where: { email: "m.mohsen@places.com" } })).id;
  const n = await prisma.notification.create({ data: { userId: salesId, text: `E2E ${stamp} إشعار` } });
  const m = await prisma.mailLog.create({ data: { to: "m.mohsen@places.com", subject: `E2E ${stamp} موضوع`, text: "x", status: "sent", sentAt: new Date(), notificationId: n.id } });
  const statusOf = async (s: string) => (await call(`/notifications/mail-log?status=${s}&pageSize=100`, { cookie: admin })).body.items.some((r: { id: string }) => r.id === m.id);
  assert.equal(await statusOf("sent"), true);
  // the salesperson opens it from the bell
  assert.equal((await call(`/notifications/${n.id}/read`, { method: "POST", cookie: await session("m.mohsen@places.com") })).status, 204);
  assert.equal(await statusOf("read"), true);
  assert.equal(await statusOf("sent"), false);
  const row = (await call("/notifications/mail-log?status=read&pageSize=100", { cookie: admin })).body.items.find((r: { id: string }) => r.id === m.id);
  assert.equal(row.status, "read");
  assert.ok(row.readAt);
});

test("the worker sends the queue; a failing address is retried, then «الإيميل فشل» and the Super Admin is told once (12.9)", async () => {
  await prisma.mailLog.createMany({ data: [
    { to: good, subject: `E2E ${stamp} ok`, text: "hello" },
    { to: bad, subject: `E2E ${stamp} bad`, text: "hello" },
  ] });
  const sent: string[] = [];
  const send = async (m: OutgoingMail) => {
    if (m.to === bad) throw new Error("550 mailbox unavailable");
    sent.push(m.to);
  };
  const t0 = new Date(Date.now() + 2_000);
  const at = (min: number) => new Date(t0.getTime() + min * 60_000);
  const row = (to: string) => prisma.mailLog.findFirstOrThrow({ where: { to } });

  await mailOutboxTick(send, t0);
  await mailOutboxTick(send, t0); // the same minute again: nothing twice
  assert.deepEqual(sent, [good]);
  assert.equal((await row(good)).status, "sent");
  let b = await row(bad);
  assert.equal(b.status, "queued");
  assert.equal(b.attempts, 1);
  assert.match(b.error ?? "", /550/);

  await mailOutboxTick(send, at(MAIL_RETRY_MINUTES)); // 2nd try
  await mailOutboxTick(send, at(2 * MAIL_RETRY_MINUTES)); // 3rd and last
  await mailOutboxTick(send, at(3 * MAIL_RETRY_MINUTES)); // nothing left to do
  b = await row(bad);
  assert.equal(b.status, "failed");
  assert.equal(b.attempts, 3);
  assert.deepEqual(sent, [good]);

  const alarms = await prisma.notification.findMany({ where: { text: { contains: `E2E ${stamp} bad` } } });
  assert.deepEqual(alarms.map((a) => a.userId).sort(), [...adminIds].sort());
  assert.match(alarms[0]!.text, /إيميل مارجعش/);
  assert.equal(alarms[0]!.important, true);
  const failed = (await call("/notifications/mail-log?status=failed&pageSize=100", { cookie: admin })).body.items.find((r: { to: string }) => r.to === bad);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /550/);
});
