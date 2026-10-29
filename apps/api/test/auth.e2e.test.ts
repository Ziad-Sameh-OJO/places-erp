/**
 * Phase 0 end-to-end: real API + real database (pnpm db:local · pnpm db:seed · pnpm --filter @places/api start).
 * Run: pnpm --filter @places/api test:e2e
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { PW, call, login } from "./helpers.ts";

test("closed by default: no session → 401", async () => {
  assert.equal((await call("/leads")).status, 401);
  assert.equal((await call("/auth/me")).status, 401);
});

test("wrong password and unknown email get the same answer", async () => {
  const a = await login("m.mohsen@places.com", "wrong-password-1");
  const b = await login("nobody@places.com", "wrong-password-1");
  assert.equal(a.status, 401);
  assert.deepEqual(a.body, b.body);
});

test("a salesperson signs in without OTP and sees only their own scope", async () => {
  const s = await login("m.mohsen@places.com");
  assert.equal(s.status, 200);
  assert.equal(s.body.otpRequired, false);
  const me = await call("/auth/me", { cookie: s.cookie! });
  assert.equal(me.body.name, "محمد محسن");
  assert.equal(me.body.scope, "own");
  assert.deepEqual(me.body.permissions.leads, ["view", "create", "edit"]);
  assert.equal(me.body.permissions.finance, undefined);
  assert.equal((await call("/leads", { cookie: s.cookie! })).status, 200);
});

test("HR has no leads permission → 403; a Team Leader works on the team scope", async () => {
  const hr = await login("basant.elsawy@places.com");
  assert.equal((await call("/leads", { cookie: hr.cookie! })).status, 403);
  const tl = await login("mahmoud.ali@places.com");
  assert.equal((await call("/auth/me", { cookie: tl.cookie! })).body.scope, "team");
});

test("Abdallah Sleem is a Team Leader and a salesperson: the roles add up", async () => {
  const s = await login("abdallah.sleem@places.com");
  const me = (await call("/auth/me", { cookie: s.cookie! })).body;
  assert.equal(me.scope, "team");
  assert.ok(me.permissions.hr.includes("approve"));   // from Team Leader
  assert.ok(me.permissions.contracts.includes("create")); // from Sales
});

test("logout ends the session at once", async () => {
  const s = await login("m.eid@places.com");
  assert.equal((await call("/auth/logout", { method: "POST", cookie: s.cookie! })).status, 204);
  assert.equal((await call("/auth/me", { cookie: s.cookie! })).status, 401);
});

test("5 wrong passwords lock the account, even the right one is refused after that", async () => {
  const email = `lock-test-${Date.now()}@places.test`;
  const u = await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW) } });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await login(email, "wrong-password-1")).status, 401);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).status, "LOCKED");
    assert.equal((await login(email)).status, 401);
  } finally {
    await prisma.auditLog.deleteMany({ where: { entityId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
    await prisma.$disconnect();
  }
});
