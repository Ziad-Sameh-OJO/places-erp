/**
 * 12.10 follow-up · M-14 (51): what the worker writes into the bell reaches the phone too, like the API's notify().
 * The visit Alarm job runs with a fake push transport (no real push service): one push per person with a device,
 * none for someone without one, none when the admin turned push off for the event, and never twice.
 * The visits are a month ahead and the job is given that time, so the other files' runs of the same job never see them.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma, pushSender, type PushDevice } from "@places/db";
import { visitAlarmTick } from "../../worker/src/processors/visit-alarm.ts";
import { usePushSender } from "../../worker/src/push.ts";

const stamp = String(Date.now());
const EVENT = "lead.visit_due";
const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
const sent: Array<{ endpoint: string; payload: { title: string; body: string; link: string } }> = [];
let withDevice: { id: string; userId: string }, without: { id: string; userId: string };
let savedRule: { toRoles: string[]; channels: string[] } | null = null;

before(async () => {
  usePushSender(pushSender(prisma, async (d: PushDevice, payload: string) => { sent.push({ endpoint: d.endpoint, payload: JSON.parse(payload) }); }));
  withDevice = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } }, select: { id: true, userId: true } });
  const hasDevice = (await prisma.pushSubscription.findMany({ select: { userId: true } })).map((s) => s.userId);
  without = await prisma.employee.findFirstOrThrow({
    where: { userId: { notIn: [withDevice.userId, ...hasDevice] }, user: { status: "ACTIVE" } }, select: { id: true, userId: true },
  });
  await prisma.pushSubscription.create({ data: { userId: withDevice.userId, endpoint: `https://push.example.invalid/wp-${stamp}`, ...keys } });
  savedRule = await prisma.notificationRule.findUnique({ where: { event: EVENT }, select: { toRoles: true, channels: true } });
});

after(async () => {
  usePushSender(async () => 0);
  await prisma.pushSubscription.deleteMany({ where: { endpoint: { contains: `wp-${stamp}` } } });
  await prisma.notification.deleteMany({ where: { text: { contains: `E2E ${stamp}` } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-WP${stamp}` } } });
  await prisma.$disconnect();
});

let n = 0;
/** A lead of `employeeId` with a visit `days` ahead (beyond every other test's clock). */
async function visitIn(days: number, employeeId: string) {
  const at = new Date(Date.now() + days * 86_400_000);
  const name = `E2E ${stamp} push ${++n}`;
  await prisma.lead.create({ data: {
    code: `L-WP${stamp}${n}`, name, phones: [`0102${stamp.slice(-7)}${n}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    assignedToId: employeeId, assignedAt: new Date(), createdById: "e2e", stage: "INTERESTED", qualified: true,
    visits: { create: { at, kind: "visit", byUserId: "e2e" } },
  } });
  return { name, after: new Date(at.getTime() + 60_000) };
}
const pushesFor = (name: string) => sent.filter((s) => s.payload.body.includes(name));

test("the visit Alarm goes to the salesperson's phone once; nobody's phone without a device", async () => {
  const mine = await visitIn(30, withDevice.id);
  const theirs = await visitIn(30, without.id);
  await visitAlarmTick(mine.after);
  await visitAlarmTick(mine.after); // a rerun sends nothing twice

  // both got the Alarm in the bell
  assert.equal(await prisma.notification.count({ where: { userId: withDevice.userId, event: EVENT, text: { contains: mine.name } } }), 1);
  assert.equal(await prisma.notification.count({ where: { userId: without.userId, event: EVENT, text: { contains: theirs.name } } }), 1);
  // one push, to his device, titled like the API's event, opening the lead
  const p = pushesFor(mine.name);
  assert.equal(p.length, 1, JSON.stringify(sent));
  assert.equal(p[0]!.endpoint, `https://push.example.invalid/wp-${stamp}`);
  assert.equal(p[0]!.payload.title, "Alarm ميعاد Visit / Meeting");
  assert.match(p[0]!.payload.link, /^\/leads\?open=/);
  assert.equal(pushesFor(theirs.name).length, 0);
});

test("the admin turns push off for the event → the Alarm stays in the bell only", async () => {
  await prisma.notificationRule.upsert({ where: { event: EVENT }, create: { event: EVENT, toRoles: [], channels: ["app"] }, update: { channels: ["app"] } });
  try {
    const v = await visitIn(31, withDevice.id);
    await visitAlarmTick(v.after);
    assert.equal(await prisma.notification.count({ where: { userId: withDevice.userId, text: { contains: v.name } } }), 1);
    assert.equal(pushesFor(v.name).length, 0);
  } finally {
    if (savedRule) await prisma.notificationRule.update({ where: { event: EVENT }, data: savedRule });
    else await prisma.notificationRule.delete({ where: { event: EVENT } });
  }
});
