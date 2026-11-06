/**
 * 12.10 · M-14 (51): push notifications. Anyone signed in turns them on for his own device from «حسابي» (audited),
 * only https push services are accepted (the API posts to that address), a device is turned off only by its owner,
 * and «ابعت إشعار تجربة» goes to one's own devices. Whether the server has VAPID keys decides `publicKey`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = Date.now();
// a push service address that never answers (.invalid): the API tries, fails quietly, keeps the device
const endpoint = `https://push.example.invalid/e2e-${stamp}`;
const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
let sales: string, hr: string, salesId: string;

before(async () => {
  [sales, hr] = await Promise.all([session("m.mohsen@places.com"), session("basant.elsawy@places.com")]);
  salesId = (await prisma.user.findUniqueOrThrow({ where: { email: "m.mohsen@places.com" } })).id;
});

after(async () => {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: { contains: `e2e-${stamp}` } } });
  await prisma.$disconnect();
});

test("push: signed out 401; the key says whether push is on; only https devices", async () => {
  assert.equal((await call("/notifications/push/subscriptions", { method: "POST", body: { endpoint, keys } })).status, 401);
  assert.equal((await call("/notifications/push/key")).status, 401);
  const key = await call("/notifications/push/key", { cookie: sales });
  assert.equal(key.status, 200);
  assert.ok(key.body.publicKey === null || typeof key.body.publicKey === "string");
  const http = await call("/notifications/push/subscriptions", { method: "POST", cookie: sales, body: { endpoint: "http://10.0.0.1/inside", keys } });
  assert.equal(http.status, 400);
  assert.match(JSON.stringify(http.body), /https/);
  assert.equal((await call("/notifications/push/subscriptions", { method: "POST", cookie: sales, body: { endpoint } })).status, 400); // no keys
});

test("push: a salesperson turns it on for his device (audited), only he turns it off, the test goes to his devices only", async () => {
  assert.equal((await call("/notifications/push/subscriptions", { method: "POST", cookie: sales, body: { endpoint, keys } })).status, 204);
  assert.equal((await call("/notifications/push/subscriptions", { method: "POST", cookie: sales, body: { endpoint, keys } })).status, 204); // twice = one device
  const rows = await prisma.pushSubscription.findMany({ where: { endpoint } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.userId, salesId);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "PushSubscription", entityId: rows[0]!.id, action: "create", userId: salesId } }));

  // someone else can't switch his device off
  assert.equal((await call("/notifications/push/subscriptions", { method: "DELETE", cookie: hr, body: { endpoint } })).status, 204);
  assert.equal(await prisma.pushSubscription.count({ where: { endpoint } }), 1);
  // the test push: his one device; HR has none
  const t = await call("/notifications/push/test", { method: "POST", cookie: sales });
  assert.equal(t.status, 200, JSON.stringify(t.body));
  assert.equal(t.body.devices, 1);
  assert.equal(t.body.sent, 0); // the address never answers, and the device is kept
  assert.equal((await call("/notifications/push/test", { method: "POST", cookie: hr })).body.devices, 0);
  assert.equal(await prisma.pushSubscription.count({ where: { endpoint } }), 1);

  assert.equal((await call("/notifications/push/subscriptions", { method: "DELETE", cookie: sales, body: { endpoint } })).status, 204);
  assert.equal(await prisma.pushSubscription.count({ where: { endpoint } }), 0);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "PushSubscription", entityId: rows[0]!.id, action: "delete" } }));
});

test("12.10 «خروج» on a shared phone: signing out drops this device's push with the session; someone else's sign-out can't", async () => {
  const phone = `${endpoint}-shared`;
  const [mine, other] = await Promise.all([session("m.mohsen@places.com"), session("basant.elsawy@places.com")]);
  assert.equal((await call("/notifications/push/subscriptions", { method: "POST", cookie: mine, body: { endpoint: phone, keys } })).status, 204);
  // HR signing out naming his device: her session ends, his device stays
  assert.equal((await call("/auth/logout", { method: "POST", cookie: other, body: { endpoint: phone } })).status, 204);
  assert.equal(await prisma.pushSubscription.count({ where: { endpoint: phone, userId: salesId } }), 1);
  assert.equal((await call("/auth/logout", { method: "POST", cookie: mine, body: { endpoint: "http://10.0.0.1/inside" } })).status, 400);
  assert.equal((await call("/auth/logout", { method: "POST", cookie: mine, body: { endpoint: phone } })).status, 204);
  assert.equal(await prisma.pushSubscription.count({ where: { endpoint: phone } }), 0);
  assert.equal((await call("/auth/me", { cookie: mine })).status, 401);
  // a sign-out without push (no body) still works
  assert.equal((await call("/auth/logout", { method: "POST", cookie: await session("basant.elsawy@places.com") })).status, 204);
});
