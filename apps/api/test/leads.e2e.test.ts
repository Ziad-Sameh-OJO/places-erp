/**
 * 1.2 leads list (M-01) against the real API and database: the data scope is in the query, and the toolbar filters.
 * Team D: Abdallah Sleem (TL) and Mohamed Mohsen. Mahmoud Ali leads another team. Heba Salah is operations; Basant is HR.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
let mohsen: string, tl: string, ops: string, hr: string;
const code = (n: number) => `L-E2E${stamp}${n}`;

before(async () => {
  [mohsen, tl, ops, hr] = await Promise.all(["m.mohsen@places.com", "abdallah.sleem@places.com", "heba.salah@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const emp = async (email: string) => (await prisma.employee.findFirstOrThrow({ where: { user: { email } } })).id;
  const mohsenId = await emp("m.mohsen@places.com");
  const teammate = (await prisma.employee.findFirstOrThrow({ where: { teamLeaderId: await emp("abdallah.sleem@places.com"), id: { not: mohsenId } } })).id;
  const otherTeam = (await prisma.employee.findFirstOrThrow({ where: { teamLeaderId: await emp("mahmoud.ali@places.com") } })).id;
  const lead = (n: number, assignedToId: string | null, extra: object = {}) => ({
    code: code(n), name: `E2E ${stamp} عميل ${n}`, phones: [`0100${stamp.slice(-7)}${n}`], area: "التجمع الخامس", type: "Rent",
    channel: "Facebook", assignedToId, createdById: "e2e", ...extra,
  });
  await prisma.lead.createMany({ data: [
    lead(1, mohsenId, { stage: "INTERESTED", qualified: true }),
    lead(2, teammate, { createdAt: new Date("2026-03-10T22:30:00Z") }), // 00:30 on 11 March in Cairo
    lead(3, otherTeam, { channel: "Instagram" }),
    lead(4, null),
  ] });
});
after(async () => {
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-E2E${stamp}` } } });
  await prisma.$disconnect();
});

const codes = async (cookie: string, query = "") => {
  const r = await call(`/leads?q=${encodeURIComponent(`E2E ${stamp}`)}&pageSize=100${query}`, { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.items.map((l: { code: string }) => l.code).sort();
};

test("data scope: sales see their own, the TL their team, operations everything; HR 403", async () => {
  assert.deepEqual(await codes(mohsen), [code(1)]);
  assert.deepEqual(await codes(tl), [code(1), code(2)]);
  assert.deepEqual(await codes(ops), [code(1), code(2), code(3), code(4)]);
  assert.equal((await call("/leads", { cookie: hr })).status, 403);
});

test("a row has what the list shows (stage name, salesperson name), not the whole record", async () => {
  const r = await call(`/leads?q=${code(1).toLowerCase()}`, { cookie: ops }); // the code in any case
  const row = r.body.items[0];
  assert.equal(r.body.total, 1);
  assert.equal(row.stage, "Interested");
  assert.equal(row.assignedTo.name, "محمد محسن");
  assert.equal(row.verification, undefined);
  assert.equal(row.createdById, undefined);
});

test("filters: stage, qualified=false, channel, search by mobile, unassigned salesperson", async () => {
  assert.deepEqual(await codes(ops, "&stage=Interested"), [code(1)]);
  assert.deepEqual(await codes(ops, "&qualified=false"), [code(2), code(3), code(4)]); // "false" means false
  assert.deepEqual(await codes(ops, "&qualified=true"), [code(1)]);
  assert.deepEqual(await codes(ops, "&channel=Instagram"), [code(3)]);
  const byPhone = await call(`/leads?q=0100-${stamp.slice(-7)}3`, { cookie: ops });
  assert.deepEqual(byPhone.body.items.map((l: { code: string }) => l.code), [code(3)]);
  // a salesperson searching someone else's mobile finds nothing: the scope is in the query
  assert.equal((await call(`/leads?q=0100${stamp.slice(-7)}3`, { cookie: mohsen })).body.total, 0);
});

test("dates are Cairo days with both ends included", async () => {
  assert.deepEqual(await codes(ops, "&from=2026-03-11&to=2026-03-11"), [code(2)]);
  assert.deepEqual(await codes(ops, "&to=2026-03-10"), []);
  assert.equal((await call("/leads?from=2026-03-12&to=2026-03-11", { cookie: ops })).status, 400);
  assert.equal((await call("/leads?qualified=maybe", { cookie: ops })).status, 400);
});

test("pagination: newest first, pages don't overlap", async () => {
  const p1 = (await call(`/leads?q=${encodeURIComponent(`E2E ${stamp}`)}&pageSize=2&page=1`, { cookie: ops })).body;
  const p2 = (await call(`/leads?q=${encodeURIComponent(`E2E ${stamp}`)}&pageSize=2&page=2`, { cookie: ops })).body;
  assert.equal(p1.total, 4);
  assert.equal(p2.items.length, 2);
  const all = [...p1.items, ...p2.items].map((l: { code: string }) => l.code);
  assert.equal(new Set(all).size, 4);
  assert.equal(all.at(-1), code(2)); // the oldest (March) comes last
});
