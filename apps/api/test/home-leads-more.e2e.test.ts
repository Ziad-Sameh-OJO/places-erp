/**
 * 1.34 «مهامي النهارده» (demo home.js 14-30), the lines 1.22 left out, each for its role only: Operations' New Lead
 * from Telesales with its clock · Telesales' lead back on the 3rd rotation · the Draft Admin's Alarm (the rule's
 * people: Operations) · a postponement waiting for the salesperson's TL · the salesperson's «كلّم … (No Answer)».
 * Team D: Abdallah Sleem (TL) and Mohamed Mohsen. Heba Salah is Operations, Hadeer Tarek Telesales, Basant HR.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import type { LeadTodayItem } from "@places/contracts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const NAME = `E2E-HM ${stamp}`;
const DAY = 24 * 3600e3;
let mohsen: string, tl: string, ops: string, hadeer: string, hr: string;
const ids: Record<string, string> = {};

before(async () => {
  [mohsen, tl, ops, hadeer, hr] = await Promise.all(["m.mohsen@places.com", "abdallah.sleem@places.com", "heba.salah@places.com", "hadeer.tarek@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const emp = async (email: string) => (await prisma.employee.findFirstOrThrow({ where: { user: { email } } })).id;
  const [mohsenId, hadeerId] = await Promise.all([emp("m.mohsen@places.com"), emp("hadeer.tarek@places.com")]);
  const lead = async (key: string, n: number, assignedToId: string, extra: object = {}) => {
    ids[key] = (await prisma.lead.create({ data: { code: `L-E2EHM${stamp}${n}`, name: `${NAME} ${key}`, phones: [], area: "التجمع الخامس", type: "Rent",
      channel: "Facebook", assignedToId, assignedAt: new Date(), touched: true, createdById: "e2e", ...extra } })).id;
  };
  await lead("newLead", 1, hadeerId, { ownedByTelesales: true, stage: "INTERESTED", newLeadRequestedAt: new Date(Date.now() - 3 * DAY) });
  await lead("back", 2, hadeerId, { ownedByTelesales: true, rotation: 3 });
  await lead("kept", 3, hadeerId, { ownedByTelesales: true, rotation: 1 }); // she keeps it herself: not «رجعلك»
  await lead("drafted", 4, mohsenId, { stage: "NOT_INTERESTED", draft: "admin" });
  await prisma.leadDraft.create({ data: { leadId: ids.drafted!, kind: "admin", at: new Date("2020-01-01T09:00:00Z"), fromId: mohsenId, stage: "NOT_INTERESTED" } });
  await lead("postponed", 5, mohsenId, { stage: "FOLLOW_UP_TO_VISIT" });
  const user = (await prisma.user.findFirstOrThrow({ where: { email: "m.mohsen@places.com" } })).id;
  await prisma.leadVisit.create({ data: { leadId: ids.postponed!, at: new Date(Date.now() + DAY), byUserId: user, postponeStatus: "pending", postponeReason: "العميل مسافر" } });
  const week = new Date(Date.now() - 7 * DAY);
  await lead("noAnswer", 6, mohsenId, { stage: "NO_ANSWER", naMarkedAt: week, naMarkedById: mohsenId });
  await lead("called", 7, mohsenId, { stage: "NO_ANSWER", naMarkedAt: week, naMarkedById: mohsenId });
  await prisma.leadCall.create({ data: { leadId: ids.called!, at: new Date(), byUserId: user } });
});
after(async () => {
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-E2EHM${stamp}` } } }); // visits, drafts and calls go with them
  await prisma.$disconnect();
});

const board = async (cookie: string) => {
  const r = await call("/home/leads", { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as LeadTodayItem[];
};
const ours = (items: LeadTodayItem[]) => items.filter((x) => x.lead?.name.startsWith(NAME)).map((x) => `${x.kind}:${x.lead!.name.split(" ").at(-1)}`).sort();

test("Operations: the New Lead from Telesales, late on its clock, and the Draft Admin Alarm (the rule names Operations)", async () => {
  const items = await board(ops);
  const nl = items.find((x) => x.kind === "newLead" && x.lead?.id === ids.newLead);
  assert.ok(nl, "the New Lead line");
  assert.equal(nl.tone, "bad");
  assert.ok((nl.minutesLeft ?? 0) < 0);
  const alarm = items.find((x) => x.kind === "draftAdmin");
  assert.ok(alarm?.drafts && alarm.drafts.waiting >= 1);
  assert.equal(alarm.tone, "bad");
  assert.deepEqual(alarm.drafts.leads[0], { name: `${NAME} drafted`, stage: "Not Interested", from: (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).name });
  assert.deepEqual(ours(items), ["newLead:newLead"]); // nobody's No Answer, Telesales or postponement lines
});

test("Telesales: only her lead back on the 3rd rotation («كلّميه تاني»), not one she keeps, not one waiting for Operations", async () => {
  assert.deepEqual(ours(await board(hadeer)), ["telesales:back"]);
  assert.ok(!(await board(hadeer)).some((x) => x.kind === "draftAdmin" || x.kind === "newLead"));
});

test("the TL: the postponement waiting for his decision, with the reason; not the No Answer «كلّمه» of his salesperson", async () => {
  const items = await board(tl);
  const p = items.find((x) => x.kind === "postpone" && x.lead?.id === ids.postponed);
  assert.equal(p?.reason, "العميل مسافر");
  assert.equal(p?.tone, "warn");
  assert.ok(p?.salesperson);
  assert.deepEqual(ours(items), ["postpone:postponed"]);
});

test("the salesperson: «كلّم … (No Answer)» after 4 working hours from the mark, not after a call just logged; no one else's lines", async () => {
  const items = await board(mohsen);
  const na = items.find((x) => x.kind === "noAnswer");
  assert.equal(na?.remindH, 4);
  assert.deepEqual(ours(items), ["noAnswer:noAnswer"]);
});

test("HR has no leads: 403", async () => {
  assert.equal((await call("/home/leads", { cookie: hr })).status, 403);
});
