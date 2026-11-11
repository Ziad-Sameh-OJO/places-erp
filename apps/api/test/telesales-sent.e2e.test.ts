/**
 * M-01 · Telesales' «اللي بعتيها» (client, 11 Nov): Hadeer sees the leads she sent to sales — to whom and when, not the
 * salesperson's actions; «No Answer» lists the ones in No Answer now and drops a lead at its next action. Telesales only.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
let hadeer: string, mohsen: string, sent: string, kept: string, other: string, mohsenName: string;

before(async () => {
  [hadeer, mohsen] = await Promise.all(["hadeer.tarek@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const hadeerUser = await prisma.user.findUniqueOrThrow({ where: { email: "hadeer.tarek@places.com" }, include: { employee: true } });
  const mohsenEmp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } });
  mohsenName = mohsenEmp.name;
  const lead = (n: number, data: object) => prisma.lead.create({ data: {
    code: `L-TS${stamp}${n}`, name: `E2E-TS ${stamp} ${n}`, phones: [`010${stamp.slice(-8)}`.slice(0, 11)], area: "التجمع الخامس", type: "Rent", channel: "Facebook", ...data,
  } }).then((l) => l.id);
  [sent, kept, other] = await Promise.all([
    lead(1, { createdById: hadeerUser.id, assignedToId: mohsenEmp.id, assignedAt: new Date() }),
    lead(2, { createdById: hadeerUser.id, assignedToId: hadeerUser.employee!.id, ownedByTelesales: true }), // she kept it
    lead(3, { createdById: "someone-else", assignedToId: mohsenEmp.id }),
  ]);
});

after(async () => {
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-TS${stamp}` } } });
  await prisma.$disconnect();
});

const list = async (q: string) => {
  const r = await call(`/leads/sent?${q}&pageSize=100`, { cookie: hadeer });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { items: Array<{ id: string; to: string | null; noAnswer: boolean } & Record<string, unknown>>; counts: { today: number; all: number; noAnswer: number } };
};

test("who: Telesales only; sales get 403", async () => {
  assert.equal((await call("/leads/sent", { cookie: mohsen })).status, 403);
});

test("today's and all: the one she sent, to whom — not the one she kept nor another's; no actions in the row", async () => {
  for (const range of ["today", "all"]) {
    const ids = (await list(`range=${range}`)).items.map((l) => l.id);
    assert.ok(ids.includes(sent), range);
    assert.ok(!ids.includes(kept) && !ids.includes(other), range);
  }
  const row = (await list("range=today")).items.find((l) => l.id === sent)!;
  assert.equal(row.to, mohsenName);
  assert.equal(row.noAnswer, false);
  assert.deepEqual(Object.keys(row).sort(), ["area", "code", "id", "name", "noAnswer", "phones", "sentAt", "to", "type"]); // no stage, no comments, no calls
});

test("«No Answer»: in it while the salesperson's mark is No Answer; his next action takes it out", async () => {
  assert.ok(!(await list("noAnswer=1")).items.some((l) => l.id === sent));
  assert.equal((await call(`/leads/${sent}/stage`, { method: "PATCH", cookie: mohsen, body: { stage: "No Answer" } })).status, 200);
  const na = await list("noAnswer=1");
  assert.ok(na.items.some((l) => l.id === sent && l.noAnswer));
  assert.ok(na.counts.noAnswer >= 1);
  assert.equal((await call(`/leads/${sent}/stage`, { method: "PATCH", cookie: mohsen, body: { stage: "Interested" } })).status, 200);
  assert.ok(!(await list("noAnswer=1")).items.some((l) => l.id === sent));
  assert.ok((await list("range=all")).items.some((l) => l.id === sent && !l.noAnswer)); // still in «اتبعتت», without the stage
});
