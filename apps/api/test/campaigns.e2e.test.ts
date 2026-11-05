/**
 * M-04 · campaigns end-to-end (4.5): Rahma adds, edits and archives a campaign (2.1 step 1, 3.1); the cost is
 * audited with its old value; leads and Qualified per campaign count every arrival (Q22); sales can't see it.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = Date.now().toString(36);
let rahma: string, sales: string, photographer: string;
let channel: string;
const campaigns: string[] = [];

before(async () => {
  [rahma, sales, photographer] = await Promise.all(["rahma.hassan@places.com", "anas@places.com", "abdelrahman.bayoumi@places.com"].map((e) => session(e)));
  channel = (await call("/marketing/campaigns/channels", { cookie: rahma })).body[0];
});

after(async () => {
  await prisma.leadArrival.deleteMany({ where: { campaignId: { in: campaigns } } });
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-C${stamp}` } } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaigns } } });
  await prisma.$disconnect();
});

const body = (extra: Record<string, unknown> = {}) => ({
  name: `E2E كامبين ${stamp}`, channel, startsOn: "2026-11-01", endsOn: "2026-11-30", budget: "20000", spent: "0", target: "مول التجمع", adUrl: "https://facebook.com/ads/1", ...extra,
});

test("sales and the photographer get 403 (M-04 4.1: the analytics aren't theirs)", async () => {
  assert.equal((await call("/marketing/campaigns", { cookie: sales })).status, 403);
  assert.equal((await call("/marketing/campaigns", { method: "POST", cookie: sales, body: body() })).status, 403);
  assert.equal((await call("/marketing/campaigns", { cookie: photographer })).status, 403);
});

test("refusals: a channel not in the list, the end before the start, a bad amount, a bad link", async () => {
  assert.ok(channel, "the seed has channels");
  for (const bad of [{ channel: "قناة مش موجودة" }, { endsOn: "2026-10-01" }, { budget: "12.345" }, { adUrl: "مش لينك" }, { name: "" }]) {
    assert.equal((await call("/marketing/campaigns", { method: "POST", cookie: rahma, body: body(bad) })).status, 400, JSON.stringify(bad));
  }
});

test("Rahma adds a campaign → leads and Qualified per campaign, every arrival counted → cost per lead → edit audited → archive", async () => {
  const r = await call("/marketing/campaigns", { method: "POST", cookie: rahma, body: body() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id as string;
  campaigns.push(id);
  // two leads from it, one Qualified; the second one came twice (a duplicate counts again, Q22)
  for (const [n, qualified, times] of [[1, true, 1], [2, false, 2]] as const) {
    const lead = await prisma.lead.create({ data: { code: `L-C${stamp}${n}`, name: `E2E ${stamp} ${n}`, phones: [`0102${stamp.slice(-7)}${n}`], area: "التجمع الخامس", type: "Rent", channel, campaignId: id, qualified, createdById: "e2e" } });
    for (let i = 0; i < times; i++) await prisma.leadArrival.create({ data: { leadId: lead.id, channel, campaignId: id, duplicate: i > 0 } });
  }
  const row = async () => (await call("/marketing/campaigns", { cookie: rahma })).body.find((c: { id: string }) => c.id === id);
  let c = await row();
  assert.equal(c.leads, 3);
  assert.equal(c.qualified, 1);
  assert.equal(c.costPerLead, "0.00");
  assert.equal(c.budget, "20000.00");

  const edited = await call(`/marketing/campaigns/${id}`, { method: "PUT", cookie: rahma, body: body({ spent: "1500", endsOn: "2026-12-15" }) });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  c = await row();
  assert.equal(c.spent, "1500.00");
  assert.equal(c.costPerLead, "500.00"); // 1,500 ÷ 3 arrivals
  assert.equal(c.endsOn, "2026-12-15");
  const audit = await prisma.auditLog.findFirst({ where: { entity: "Campaign", entityId: id, action: "update" } });
  assert.equal((audit!.before as { spent: string }).spent, "0.00");
  assert.equal((audit!.after as { spent: string }).spent, "1500");

  assert.equal((await call(`/marketing/campaigns/${id}`, { method: "DELETE", cookie: sales })).status, 403);
  assert.equal((await call(`/marketing/campaigns/${id}`, { method: "DELETE", cookie: rahma })).status, 204);
  assert.equal(await row(), undefined);
  assert.equal((await call(`/marketing/campaigns/${id}`, { method: "PUT", cookie: rahma, body: body() })).status, 404);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Campaign", entityId: id } }), 3);
});
