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
  await prisma.campaignPage.deleteMany({ where: { name: { contains: stamp } } });
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

  // 4.6 · the dashboard, filtered to this campaign and today: the numbers match the arrivals; the post that brought them
  await prisma.lead.updateMany({ where: { code: `L-C${stamp}1` }, data: { post: `E2E بوست ${stamp}` } });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const dash = await call(`/marketing/campaigns/dashboard?campaignId=${id}&from=${today}&to=${today}`, { cookie: rahma });
  assert.equal(dash.status, 200, JSON.stringify(dash.body));
  assert.deepEqual(dash.body.total, { leads: 3, qualified: 1, rate: 33.3 });
  assert.equal(dash.body.spent, "1500.00");
  assert.equal(dash.body.costPerQualified, "1500.00");
  const node = dash.body.channels.find((x: { channel: string }) => x.channel === channel);
  assert.deepEqual(node.campaigns.map((x: { id: string; leads: number; qualified: number }) => [x.id, x.leads, x.qualified]), [[id, 3, 1]]);
  assert.deepEqual(dash.body.posts, [{ post: `E2E بوست ${stamp}`, leads: 1 }]);
  const yesterday = new Date(Date.now() - 2 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  assert.equal((await call(`/marketing/campaigns/dashboard?campaignId=${id}&from=${yesterday}&to=${yesterday}`, { cookie: rahma })).body.total.leads, 0);
  assert.equal((await call(`/marketing/campaigns/dashboard?from=${today}&to=${yesterday}`, { cookie: rahma })).status, 400);
  assert.equal((await call("/marketing/campaigns/dashboard", { cookie: sales })).status, 403);

  assert.equal((await call(`/marketing/campaigns/${id}`, { method: "DELETE", cookie: sales })).status, 403);
  assert.equal((await call(`/marketing/campaigns/${id}`, { method: "DELETE", cookie: rahma })).status, 204);
  assert.equal(await row(), undefined);
  assert.equal((await call(`/marketing/campaigns/${id}`, { method: "PUT", cookie: rahma, body: body() })).status, 404);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Campaign", entityId: id } }), 3);
});

test("4.18 · the leads that weren't Qualified: per reason, the salesperson's last comment and its author, no mobiles; sales 403", async () => {
  const made = await call("/marketing/campaigns", { method: "POST", cookie: rahma, body: body({ name: `E2E غير مؤهل ${stamp}` }) });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.id as string;
  campaigns.push(id);
  const anas = await prisma.user.findFirstOrThrow({ where: { email: "anas@places.com" }, select: { id: true, employee: { select: { name: true } } } });
  const leads: Array<[number, "NO_ANSWER" | "NOT_INTERESTED" | "FRESH" | "INTERESTED", boolean]> = [[3, "NO_ANSWER", false], [4, "NO_ANSWER", false], [5, "NOT_INTERESTED", false], [6, "FRESH", false], [7, "INTERESTED", true]];
  for (const [n, stage, qualified] of leads) {
    const lead = await prisma.lead.create({ data: { code: `L-C${stamp}${n}`, name: `E2E ${stamp} ${n}`, phones: [`0102${stamp.slice(-7)}${n}`], area: "التجمع الخامس", type: "Rent", channel, campaignId: id, stage, qualified, createdById: "e2e" } });
    await prisma.leadArrival.create({ data: { leadId: lead.id, channel, campaignId: id } });
    if (n === 5) {
      await prisma.leadActivity.create({ data: { leadId: lead.id, kind: "comment", text: "مش محتاج مكتب دلوقتي", byUserId: anas.id, at: new Date(Date.now() - 60_000) } });
      await prisma.leadActivity.create({ data: { leadId: lead.id, kind: "stage", text: "Not Interested", byUserId: anas.id } });
      await prisma.leadActivity.create({ data: { leadId: lead.id, kind: "assign", text: "اتوزّع", byUserId: null } });
    }
  }
  assert.equal((await call(`/marketing/campaigns/not-qualified?campaignId=${id}`, { cookie: sales })).status, 403);
  const r = await call(`/marketing/campaigns/not-qualified?campaignId=${id}`, { cookie: rahma });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.total, r.body.notQualified, r.body.matching], [5, 4, 4]);
  assert.deepEqual(r.body.byReason, [{ reason: "No Answer", count: 2 }, { reason: "Not Interested", count: 1 }, { reason: "Fresh", count: 1 }]);
  const ni = r.body.rows.find((x: { code: string }) => x.code === `L-C${stamp}5`);
  assert.deepEqual(ni.comment && [ni.comment.text, ni.comment.by], ["مش محتاج مكتب دلوقتي", anas.employee?.name ?? "anas@places.com"]);
  assert.equal(r.body.rows.find((x: { code: string }) => x.code === `L-C${stamp}6`).comment, null);
  assert.ok(!JSON.stringify(r.body).includes(`0102${stamp.slice(-7)}`), "no mobile leaves the API");
  const only = await call(`/marketing/campaigns/not-qualified?campaignId=${id}&reason=${encodeURIComponent("No Answer")}`, { cookie: rahma });
  assert.deepEqual([only.body.matching, only.body.rows.length, only.body.notQualified], [2, 2, 4]);
});

test("4.19 · «Page name» from «أسماء الصفحات»: add, a campaign on it, rename moves it, remove keeps it; audited; sales 403", async () => {
  assert.equal((await call("/marketing/campaigns/pages", { cookie: sales })).status, 403);
  assert.equal((await call("/marketing/campaigns/pages", { method: "POST", cookie: sales, body: { name: `Bayut ${stamp}` } })).status, 403);
  const list = await call("/marketing/campaigns/pages", { cookie: rahma });
  assert.equal(list.status, 200);
  assert.ok(["Website", "Property Finder", "Dubizzle"].every((n) => list.body.some((p: { name: string }) => p.name === n)));
  assert.equal((await call("/marketing/campaigns/pages", { method: "POST", cookie: rahma, body: { name: " website " } })).status, 400); // already there
  const added = await call("/marketing/campaigns/pages", { method: "POST", cookie: rahma, body: { name: `Bayut ${stamp}` } });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  const pageId = added.body.id as string;
  // a page not in the list is refused; one in it is kept on the campaign
  assert.equal((await call("/marketing/campaigns", { method: "POST", cookie: rahma, body: body({ page: `مش في القايمة ${stamp}` }) })).status, 400);
  const made = await call("/marketing/campaigns", { method: "POST", cookie: rahma, body: body({ name: `E2E صفحة ${stamp}`, page: `Bayut ${stamp}` }) });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  campaigns.push(made.body.id);
  const page = async () => (await call("/marketing/campaigns", { cookie: rahma })).body.find((c: { id: string }) => c.id === made.body.id).page;
  assert.equal(await page(), `Bayut ${stamp}`);
  assert.equal((await call(`/marketing/campaigns/pages/${pageId}`, { method: "PUT", cookie: rahma, body: { name: "Dubizzle" } })).status, 400);
  assert.equal((await call(`/marketing/campaigns/pages/${pageId}`, { method: "PUT", cookie: rahma, body: { name: `Bayut Egypt ${stamp}` } })).status, 204);
  assert.equal(await page(), `Bayut Egypt ${stamp}`);
  assert.equal((await call("/marketing/campaigns/pages", { cookie: rahma })).body.find((p: { id: string }) => p.id === pageId).campaigns, 1);
  assert.equal((await call(`/marketing/campaigns/pages/${pageId}`, { method: "DELETE", cookie: sales })).status, 403);
  assert.equal((await call(`/marketing/campaigns/pages/${pageId}`, { method: "DELETE", cookie: rahma })).status, 204);
  assert.equal(await page(), `Bayut Egypt ${stamp}`); // the campaign keeps its name
  // and can still be saved with it, though it's off the list now
  const kept = await call(`/marketing/campaigns/${made.body.id}`, { method: "PUT", cookie: rahma, body: body({ name: `E2E صفحة ${stamp}`, page: `Bayut Egypt ${stamp}` }) });
  assert.equal(kept.status, 200, JSON.stringify(kept.body));
  assert.deepEqual((await prisma.auditLog.findMany({ where: { entity: "CampaignPage", entityId: pageId }, orderBy: { at: "asc" } })).map((a) => a.action), ["create", "update", "delete"]);
  await prisma.auditLog.deleteMany({ where: { entity: "CampaignPage", entityId: pageId } });
});
