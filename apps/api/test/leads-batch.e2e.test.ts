/**
 * The leads list's bulk bar and «تصدير الليدز» (demo shell.js renderBulk · U.exportBtn · M-12) against the real API
 * and database. Heba (Operations) hands picked leads to Ahmed Amr — each one as «اسحب الليد وحوّله» (1.14: audited,
 * his next turn used up) — and moves their stage; Ziad Medhat (sales) may change the stage of his own leads only and
 * can't hand out, archive or export; the admin archives. The Sales filter lists Telesales as «<name> (Telesales)».
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const stamp = String(Date.now());
const C = `E2E ${stamp} LB`;
let heba: string, ziad: string, admin: string;
let ziadId: string, amrId: string, skipBefore: number | undefined;
const L: string[] = [];

before(async () => {
  [heba, ziad, admin] = await Promise.all(["heba.salah@places.com", "ziad.medhat@places.com", "ahmed.islam@places.com"].map((e) => session(e)));
  const emp = (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } } }).then((e) => e.id);
  [ziadId, amrId] = await Promise.all([emp("ziad.medhat@places.com"), emp("ahmed.amr@places.com")]);
  const routing = (await prisma.setting.findUnique({ where: { key: "routing" } }))?.value as { skipTurns?: Record<string, number> } | undefined;
  skipBefore = routing?.skipTurns?.[amrId];
  for (let n = 1; n <= 4; n++) {
    L.push((await prisma.lead.create({ data: {
      code: `L-LB${stamp}${n}`, name: `${C} ${n}`, phones: [`011${stamp.slice(-7)}${n}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
      assignedToId: n === 4 ? amrId : ziadId, assignedAt: new Date(), createdById: "e2e", stage: "FRESH",
    } })).id);
  }
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: L } }, { entity: "Lead", entityId: "export", at: { gte: new Date(Number(stamp)) } }] } });
  await prisma.notification.deleteMany({ where: { text: { contains: C } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-LB${stamp}` } } });
  await restoreSkips();
  await prisma.$disconnect();
});

/** The hand assignments used up his turns (Q2): put his count back at once, so other files' rotations aren't moved. */
const restoreSkips = () => prisma.$executeRaw`UPDATE "system"."Setting" SET "value" = jsonb_set("value", ARRAY['skipTurns', ${amrId}], ${JSON.stringify(skipBefore ?? 0)}::jsonb) WHERE "key" = 'routing'`;
const batch = (cookie: string, body: object) => call("/leads/batch", { method: "POST", cookie, body });
const lead = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });

test("who may: sales can't hand out or archive; a stage only on his own leads, the rest reported", async () => {
  assert.equal((await batch(ziad, { ids: [L[0]], to: amrId })).status, 403);
  assert.equal((await call("/leads/batch/archive", { method: "POST", cookie: ziad, body: { ids: [L[0]] } })).status, 403);
  assert.equal((await batch(ziad, { ids: [L[0]] })).status, 400); // neither a salesperson nor a stage
  assert.equal((await batch(ziad, { ids: [L[0]], stage: "Visit" })).status, 400); // Visit needs a time and units
  const r = await batch(ziad, { ids: [L[0], L[3]], stage: "Interested" });
  assert.equal(r.status, 200);
  assert.equal(r.body.done, 1);
  assert.deepEqual(r.body.failed.map((x: { id: string }) => x.id), [L[3]]); // Ahmed Amr's lead: out of his scope
  assert.equal((await lead(L[0]!)).stage, "INTERESTED");
  assert.equal((await lead(L[3]!)).stage, "FRESH");
});

test("Operations: «حوّل لسيلز» + «غيّر المرحلة» on each lead, audited one by one, his next turns used up", async () => {
  const r = await batch(heba, { ids: [L[0], L[1], L[3]], to: amrId, stage: "No Answer" });
  await restoreSkips();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { done: 3, failed: [] });
  for (const id of [L[0]!, L[1]!, L[3]!]) {
    const l = await lead(id);
    assert.equal(l.assignedToId, amrId);
    assert.equal(l.stage, "NO_ANSWER");
    assert.equal(await prisma.auditLog.count({ where: { entity: "Lead", entityId: id, action: "stage" } }) >= 1, true);
  }
  // L[3] was his already: not handed again (demo), so two hand assignments — each through assign() (1.14), which uses
  // up his turn; the count isn't asserted: other files' rotations in the same area may take his turns meanwhile
  assert.equal(await prisma.auditLog.count({ where: { entity: "Lead", entityId: { in: L }, action: "reassign" } }), 2);
});

test("«أرشفة» on the picked leads: the admin; each one audited and gone from the list", async () => {
  const r = await call("/leads/batch/archive", { method: "POST", cookie: admin, body: { ids: [L[1], L[2]] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { done: 2, failed: [] });
  assert.equal(await prisma.auditLog.count({ where: { entity: "Lead", entityId: { in: [L[1]!, L[2]!] }, action: "archive" } }), 2);
  const list = await call(`/leads?q=${encodeURIComponent(C)}`, { cookie: admin });
  assert.deepEqual(list.body.items.map((x: { id: string }) => x.id).sort(), [L[0], L[3]].sort());
});

test("«تصدير الليدز»: the filtered list as Excel for whoever has «leads: export», audited; sales can't", async () => {
  const res = await fetch(`${API}/leads/export?q=${encodeURIComponent(C)}`, { headers: { cookie: heba } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /spreadsheetml/);
  assert.ok((await res.arrayBuffer()).byteLength > 0);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Lead", entityId: "export", action: "export" }, orderBy: { at: "desc" } });
  assert.deepEqual(audit.after, { rows: 2, filters: { q: C } });
  assert.equal((await fetch(`${API}/leads/export`, { headers: { cookie: ziad } })).status, 403);
});

test("the Sales filter lists Telesales as «<name> (Telesales)» after the salespeople (demo leads.js)", async () => {
  const names: string[] = (await call("/leads/options", { cookie: heba })).body.salespeople.map((p: { name: string }) => p.name);
  const hadeer = await prisma.employee.findFirstOrThrow({ where: { user: { email: "hadeer.tarek@places.com" } } });
  const i = names.indexOf(`${hadeer.name} (Telesales)`);
  assert.ok(i > 0);
  assert.ok(names.slice(i).every((n) => n.endsWith("(Telesales)")));
});
