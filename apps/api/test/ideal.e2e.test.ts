/**
 * 7.11 · the ideal employee and the team fund (M-05, client sheet 28/10): HR (Basant) sees every team, its winner and the
 * fund; a salesperson can't. An approved administrative penalty this month rules a person out. The client's example
 * (team of 5, 3,000) is in packages/domain/test/people.test.ts.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const P = `e2e-ideal-${Date.now()}`;
let basant: string, sales: string, youssef: { id: string };

before(async () => {
  [basant, sales] = await Promise.all(["basant.elsawy@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  youssef = await prisma.employee.findFirstOrThrow({ where: { user: { email: "youssef.safwat@places.com" } }, select: { id: true } });
});
after(async () => {
  await prisma.penalty.deleteMany({ where: { text: P } });
  await prisma.$disconnect();
});

test("7.11 · HR sees each team's ideal employee and fund; a penalty rules one out; sales 403", async () => {
  assert.equal((await call("/hr/ideal", { cookie: sales })).status, 403);
  const admin = (await prisma.user.findFirstOrThrow({ where: { email: "basant.elsawy@places.com" } })).id;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  await prisma.penalty.create({ data: { employeeId: youssef.id, day: new Date(`${today}T00:00:00Z`), text: P, byUserId: admin, status: "approved" } });
  const r = await call("/hr/ideal", { cookie: basant });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.month, today.slice(0, 7));
  assert.ok(r.body.teams.length >= 1);
  const team = r.body.teams.find((t: { rows: { employeeId: string }[] }) => t.rows.some((x) => x.employeeId === youssef.id));
  assert.ok(team, "Youssef's sales team is listed");
  assert.equal(team.rows.find((x: { employeeId: string }) => x.employeeId === youssef.id).status, "penalty");
  assert.notEqual(team.winner?.employeeId, youssef.id);
  assert.match(team.fund, /^\d+\.\d{2}$/);
});
