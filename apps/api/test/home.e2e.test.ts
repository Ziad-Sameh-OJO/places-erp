/**
 * 1.22 «مهامي النهارده» (demo home.js): the lines that come from the leads, in the caller's scope.
 * Team D: Abdallah Sleem (TL) and Mohamed Mohsen. Mahmoud Ali leads another team. Heba Salah is operations; Basant is HR.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const code = (n: number) => `L-E2EH${stamp}${n}`;
let mohsen: string, tl: string, ops: string, hr: string, hadeer: string;
const ids: Record<string, string> = {};
const visitIds: Record<string, string> = {};

before(async () => {
  [mohsen, tl, ops, hr, hadeer] = await Promise.all(["m.mohsen@places.com", "abdallah.sleem@places.com", "heba.salah@places.com", "basant.elsawy@places.com", "hadeer.tarek@places.com"].map((e) => session(e)));
  const emp = async (email: string) => (await prisma.employee.findFirstOrThrow({ where: { user: { email } } })).id;
  const mohsenId = await emp("m.mohsen@places.com");
  const teammate = (await prisma.employee.findFirstOrThrow({ where: { teamLeaderId: await emp("abdallah.sleem@places.com"), id: { not: mohsenId } } })).id;
  const otherTeam = (await prisma.employee.findFirstOrThrow({ where: { teamLeaderId: await emp("mahmoud.ali@places.com") } })).id;
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600e3);
  const lead = async (key: string, n: number, assignedToId: string, extra: object = {}) => {
    ids[key] = (await prisma.lead.create({ data: { code: code(n), name: `E2E-H ${stamp} ${key}`, phones: [`0106${stamp.slice(-6)}${n}`], area: "التجمع الخامس",
      type: "Rent", channel: "Facebook", assignedToId, assignedAt: monthAgo, createdById: "e2e", ...extra } })).id;
  };
  await lead("late", 1, mohsenId);                                   // Fresh, untouched, a month old: pulled
  await lead("touched", 2, mohsenId, { touched: true, stage: "INTERESTED" });
  await lead("teammate", 3, teammate);
  await lead("other", 4, otherTeam);
  const user = (await prisma.user.findFirstOrThrow({ where: { email: "m.mohsen@places.com" } })).id;
  const visit = async (key: string, leadKey: string, at: Date, extra: object = {}) => {
    visitIds[key] = (await prisma.leadVisit.create({ data: { leadId: ids[leadKey]!, at, byUserId: user, ...extra } })).id;
  };
  const day = 24 * 3600e3;
  await visit("yesterday", "touched", new Date(Date.now() - day));
  await visit("today", "touched", new Date(), { kind: "meeting" });
  await visit("tomorrow", "touched", new Date(Date.now() + day));
  await visit("done", "touched", new Date(Date.now() - day), { outcome: "done" });
  await visit("teammate", "teammate", new Date());
});
after(async () => {
  // marking yesterday's Visit wrote Mohsen's day for it (7.3): the day this file opened
  await prisma.attendanceDay.deleteMany({ where: { employee: { user: { email: "m.mohsen@places.com" } }, source: "visit", createdAt: { gte: new Date(Number(stamp)) } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-E2EH${stamp}` } } }); // the visits go with them
  await prisma.$disconnect();
});

interface Item { kind: string; tone: string; lead: { id: string; name: string } | null; salesperson: string | null; sla: { level: string } | null; visit: { id: string; kind: string } | null }
const mine = async (cookie: string) => {
  const r = await call("/home/leads", { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const all = r.body as Item[];
  return all.filter((x) => x.lead?.name.startsWith(`E2E-H ${stamp}`)); // the Draft Admin Alarm (1.34) has no lead
};
const keys = (items: Item[]) => items.map((x) => `${x.kind}:${x.visit ? Object.keys(visitIds).find((k) => visitIds[k] === x.visit!.id) : x.lead!.name.split(" ").at(-1)}`);

test("a salesperson: his own late lead and his visits due today or late, the late ones first; not tomorrow's, not a marked one", async () => {
  const items = await mine(mohsen);
  assert.deepEqual(keys(items), ["sla:late", "visit:yesterday", "visit:today"]);
  const [sla, yesterday, today] = items as [Item, Item, Item];
  assert.deepEqual([sla.tone, sla.sla?.level, sla.salesperson], ["bad", "pull", "محمد محسن"]);
  assert.deepEqual([yesterday.tone, yesterday.visit?.kind], ["bad", "Visit"]);
  assert.deepEqual([today.tone, today.visit?.kind], ["", "Meeting"]);
});

test("the TL: his team's (his salesperson's and the teammate's), not another team's", async () => {
  assert.deepEqual(keys(await mine(tl)).sort(), ["sla:late", "sla:teammate", "visit:teammate", "visit:today", "visit:yesterday"]);
});

test("Operations: every late lead, no visits (demo); Telesales: nothing of others'; HR has no leads: 403", async () => {
  assert.deepEqual(keys(await mine(ops)).sort(), ["sla:late", "sla:other", "sla:teammate"]);
  assert.deepEqual(await mine(hadeer), []);
  assert.equal((await call("/home/leads", { cookie: hr })).status, 403);
});

test("a lead leaves the board once acted on, a visit once marked", async () => {
  assert.equal((await call(`/leads/${ids.late}/comments`, { method: "POST", cookie: mohsen, body: { text: "كلمته" } })).status, 201);
  assert.equal((await call(`/leads/${ids.touched}/visits/${visitIds.yesterday}/outcome`, { method: "POST", cookie: mohsen, body: { outcome: "done" } })).status, 200);
  assert.deepEqual(keys(await mine(mohsen)), ["visit:today"]);
});
