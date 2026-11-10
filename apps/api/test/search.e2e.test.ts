/**
 * 0.17 · «بحث سريع» GET /search: each kind within the person's scope and module «view», at most 5 of each, and a
 * mobile hidden by field permissions (M-09) isn't searched. Team D: Abdallah Sleem (TL) and Mohamed Mohsen; Mahmoud
 * Ali leads another team. Heba Salah = operations, Basant = HR (no leads), Ahmed Islam = Super Admin.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { PW, call, session } from "./helpers.ts";

const stamp = String(Date.now());
const P = `E2E-Q ${stamp}`;
const KEY = `e2e-search-${stamp}`;
const phone = (n: number) => `0109${stamp.slice(-6)}${n}`;
let mohsen: string, ops: string, hr: string, admin: string, person: string, roleId: string, userId: string;
type Hit = { kind: string; id: string; label: string; sub: string[] };

before(async () => {
  [mohsen, ops, hr, admin] = await Promise.all(["m.mohsen@places.com", "heba.salah@places.com", "basant.elsawy@places.com", "ahmed.islam@places.com"].map((e) => session(e)));
  const emp = async (email: string) => (await prisma.employee.findFirstOrThrow({ where: { user: { email } } })).id;
  const mohsenId = await emp("m.mohsen@places.com");
  const otherTeam = (await prisma.employee.findFirstOrThrow({ where: { teamLeaderId: await emp("mahmoud.ali@places.com") } })).id;
  const lead = (n: number, assignedToId: string) => ({ code: `L-E2EQ${stamp}${n}`, name: `${P} عميل ${n}`, phones: [phone(n)], area: "التجمع الخامس", type: "Rent", channel: "Facebook", assignedToId, createdById: "e2e" });
  await prisma.lead.createMany({ data: [lead(1, mohsenId), lead(2, otherTeam), ...[3, 4, 5, 6, 7].map((n) => lead(n, otherTeam))] });
  // a role that only views leads, with the mobile hidden (M-09)
  roleId = (await prisma.role.create({ data: { key: KEY, label: `E2E search ${stamp}`, tier: "Executive Staff", scope: "ALL", permissions: { create: [{ module: "leads", actions: ["view"] }] } } })).id;
  const email = `search-${stamp}@places.test`;
  userId = (await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } })).id;
  person = await session(email);
});
after(async () => {
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-E2EQ${stamp}` } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: roleId }, { userId }] } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

const find = async (cookie: string, q: string) => {
  const r = await call(`/search?q=${encodeURIComponent(q)}`, { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (r.body as { hits: Hit[] }).hits;
};
const leads = async (cookie: string, q: string) => (await find(cookie, q)).filter((h) => h.kind === "lead").map((h) => h.label);

test("sales find their own lead only, by name or by mobile; operations at most 5 of them", async () => {
  assert.deepEqual(await leads(mohsen, P), [`${P} عميل 1`]);
  assert.deepEqual(await leads(mohsen, phone(2)), []); // someone else's lead: not found
  assert.deepEqual(await leads(mohsen, phone(1)), [`${P} عميل 1`]);
  assert.equal((await leads(ops, P)).length, 5);
  const hit = (await find(ops, `${P} عميل 2`)).find((h) => h.kind === "lead")!;
  assert.ok(hit.sub.includes(`L-E2EQ${stamp}2`));
});

test("a mobile hidden by field permissions isn't searched and doesn't come back", async () => {
  assert.equal((await call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body: { module: "leads", rules: { phones: "hide" } } })).status, 204);
  assert.deepEqual(await leads(person, phone(1)), []);
  const byName = (await find(person, `${P} عميل 1`)).find((h) => h.kind === "lead")!;
  assert.ok(!byName.sub.some((s) => s.includes(phone(1))), JSON.stringify(byName));
});

test("only the modules the person may view: HR gets no leads but employees; one letter is 400; signed out 401", async () => {
  const kinds = new Set((await find(hr, "محمد")).map((h) => h.kind));
  assert.ok(!kinds.has("lead") && !kinds.has("deal"));
  assert.ok(kinds.has("employee"));
  assert.equal((await call("/search?q=a", { cookie: ops })).status, 400);
  assert.equal((await call(`/search?q=${encodeURIComponent(P)}`)).status, 401);
});
