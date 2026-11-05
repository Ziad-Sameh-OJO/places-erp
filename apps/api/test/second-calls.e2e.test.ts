/**
 * 11.15 «مكالمات التحقق (Second Calls)»: Operations (Heba) sees today's leads minus the salesperson's own and the excluded
 * Channels, plus past days' ones still not done (late), and records «Second Call Done» with a required note; a
 * salesperson can't (403). The note lands on the lead's `verification`, which the daily KPI job measures.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import type { SecondCallRow } from "@places/contracts";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
let heba: string, mohsen: string;
const ids: Record<"today" | "own" | "safwat" | "past", string> = { today: "", own: "", safwat: "", past: "" };

before(async () => {
  [heba, mohsen] = await Promise.all(["heba.salah@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const mk = async (k: keyof typeof ids, extra: { selfEntered?: boolean; channel?: string; createdAt?: Date }) =>
    (ids[k] = (await prisma.lead.create({ data: { code: `L-E2ESC${k}${stamp}`, name: `E2E-SC ${stamp} ${k}`, phones: [], area: "التجمع الخامس", type: "Rent",
      channel: "Facebook", createdById: "e2e", ...extra } })).id);
  await mk("today", {});
  await mk("own", { selfEntered: true });
  await mk("safwat", { channel: "By Safwat" });
  await mk("past", { createdAt: new Date(Date.now() - 2 * 86_400_000) });
});
after(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await prisma.$disconnect();
});

const list = async () => ((await call("/leads/second-calls", { cookie: heba })).body as SecondCallRow[]).filter((r) => r.name.startsWith(`E2E-SC ${stamp}`));
const done = (cookie: string, id: string, body: unknown) => call(`/leads/second-calls/${id}`, { method: "POST", cookie, body });

test("who: Operations sees and records; a salesperson gets 403", async () => {
  assert.equal((await call("/leads/second-calls", { cookie: mohsen })).status, 403);
  assert.equal((await done(mohsen, ids.today, { called: true, sent: true, note: "تمام" })).status, 403);
});

test("today's leads minus the salesperson's own and «By Safwat»; a past day's undone one is late", async () => {
  const rows = await list();
  assert.deepEqual(rows.map((r) => [r.id, r.late, r.done]).sort(), [[ids.today, false, null], [ids.past, true, null]].sort());
});

test("Second Call Done needs a note, is recorded once, with an activity line and an audit row", async () => {
  assert.equal((await done(heba, ids.today, { called: true, sent: false, note: "  " })).status, 400);
  assert.equal((await done(heba, ids.own, { called: true, sent: true, note: "x" })).status, 404);
  assert.equal((await done(heba, ids.today, { called: true, sent: false, note: "العميل عايز مساحة أكبر" })).status, 200);
  assert.equal((await done(heba, ids.today, { called: true, sent: true, note: "تاني" })).status, 409);
  const row = (await list()).find((r) => r.id === ids.today)!;
  assert.equal(row.done?.note, "العميل عايز مساحة أكبر");
  assert.equal(row.done?.sent, false);
  const v = (await prisma.lead.findUniqueOrThrow({ where: { id: ids.today } })).verification as { at: string; byUserId: string };
  assert.ok(v.at && v.byUserId);
  assert.ok(await prisma.leadActivity.findFirst({ where: { leadId: ids.today, kind: "verify", text: { contains: "السيلز كلّمه · مبعتلوش" } } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Lead", entityId: ids.today, action: "second-call" } }));
  // a past day's lead, done today, leaves the late list
  assert.equal((await done(heba, ids.past, { called: true, sent: true, note: "اتكلمنا" })).status, 200);
  assert.deepEqual((await list()).map((r) => r.id), [ids.today]);
});
