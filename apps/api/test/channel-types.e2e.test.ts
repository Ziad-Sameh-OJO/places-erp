/**
 * «نوع الـ Channel» (client, 22 Nov): the marketing types a list under each channel in «الإعدادات ← القوايم»
 * (Instagram → Reel, Story…); a lead of that channel may say which one, and the leads list filters by it.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const TYPE = `E2E Reel ${stamp}`;
let rahma: string, heba: string, mohsen: string, channel: string, other: string;
let before_: unknown;
const leadIds: string[] = [];

type Item = { value: string; active: boolean };
const types = async (cookie: string) => (await call("/settings", { cookie })).body.channelTypes as Record<string, Item[]>;
const put = (cookie: string, value: unknown) => call("/settings/channelTypes", { method: "PUT", cookie, body: { value } });

before(async () => {
  [rahma, heba, mohsen] = await Promise.all(["rahma.hassan@places.com", "heba.salah@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const channels = ((await call("/settings", { cookie: rahma })).body.channels as Item[]).filter((c) => c.active).map((c) => c.value);
  [channel, other] = [channels[0]!, channels[1]!];
  before_ = (await prisma.setting.findUnique({ where: { key: "channelTypes" } }))?.value ?? null;
});
after(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  // the types can only be switched off through the API (never deleted): the test puts the setting back as it was
  if (before_ === null) await prisma.setting.deleteMany({ where: { key: "channelTypes" } });
  else await prisma.setting.update({ where: { key: "channelTypes" }, data: { value: before_ as never } });
  await prisma.auditLog.deleteMany({ where: { entity: "Setting", entityId: "channelTypes", userId: (await prisma.user.findUniqueOrThrow({ where: { email: "rahma.hassan@places.com" } })).id, at: { gte: new Date(Number(stamp)) } } });
  await prisma.$disconnect();
});

test("who: the marketing (the channels' department) types the list; a salesperson can't (403)", async () => {
  const now = await types(rahma);
  assert.equal((await put(mohsen, { ...now, [channel]: [...(now[channel] ?? []), { value: TYPE, active: true }] })).status, 403);
  const r = await put(rahma, { ...now, [channel]: [...(now[channel] ?? []), { value: TYPE, active: true }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok((await types(heba))[channel]!.some((t) => t.value === TYPE && t.active));
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Setting", entityId: "channelTypes" } }));
});

test("the lists' rules: under a channel of the list only, and switched off instead of deleted (400)", async () => {
  const now = await types(rahma);
  assert.equal((await put(rahma, { ...now, "مش Channel": [{ value: "x", active: true }] })).status, 400);
  assert.equal((await put(rahma, { ...now, [channel]: now[channel]!.filter((t) => t.value !== TYPE) })).status, 400);
});

test("a lead says its type; another channel's or an unknown one is refused (400); the list filters by it", async () => {
  const body = (n: number, extra: object) => ({ name: `E2E نوع ${stamp} ${n}`, phones: [`0112${stamp.slice(-7)}${n}`.slice(0, 11)], area: "التجمع الخامس", type: "Rent", channel, ...extra });
  assert.equal((await call("/leads", { method: "POST", cookie: heba, body: body(1, { channelType: "مش موجود" }) })).status, 400);
  assert.equal((await call("/leads", { method: "POST", cookie: heba, body: body(1, { channel: other, channelType: TYPE }) })).status, 400);
  const r = await call("/leads", { method: "POST", cookie: heba, body: body(1, { channelType: TYPE }) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  leadIds.push(r.body.id);
  assert.equal((await call(`/leads/${r.body.id}`, { cookie: heba })).body.channelType, TYPE);
  const found = (await call(`/leads?pageSize=50&channel=${encodeURIComponent(channel)}&channelType=${encodeURIComponent(TYPE)}`, { cookie: heba })).body;
  assert.deepEqual(found.items.map((l: { id: string }) => l.id), [r.body.id]);
  // a type switched off later: the lead keeps it, a new lead can't pick it
  const now = await types(rahma);
  assert.equal((await put(rahma, { ...now, [channel]: now[channel]!.map((t) => (t.value === TYPE ? { ...t, active: false } : t)) })).status, 200);
  assert.equal((await call(`/leads/${r.body.id}`, { cookie: heba })).body.channelType, TYPE);
  assert.equal((await call("/leads", { method: "POST", cookie: heba, body: body(2, { channelType: TYPE }) })).status, 400);
});
