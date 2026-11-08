/**
 * M-09 field permissions on the leads (M-01) against the real API: a hidden field's value never leaves the API (list,
 * board, drawer, Excel, the «الوحدات» tab), a filter or a search on it is dropped, a save keeps what the person may not
 * change and a new lead starts it empty. The units shown from a lead follow the inventory's field rules. Its own role
 * and person, so the seeded roles other test files use stay as they are. Ahmed Islam = Super Admin.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { API, PW, call, session } from "./helpers.ts";

const stamp = Date.now();
const P = `E2E ${stamp} LFIELDS`;
const KEY = `e2e-lfields-${stamp}`;
const phone = `011${String(stamp).slice(-7)}1`, phone2 = `011${String(stamp).slice(-7)}2`;
let admin: string, person: string, roleId: string, userId: string, leadId: string, unitId: string, campaignId: string;

before(async () => {
  admin = await session("ahmed.islam@places.com");
  campaignId = (await prisma.campaign.create({ data: { name: `${P} كامبين`, channel: "Facebook", startsOn: new Date("2026-01-01"), endsOn: new Date("2026-12-31"), budget: "1000" } })).id;
  const role = await prisma.role.create({ data: { key: KEY, label: `E2E lead fields ${stamp}`, tier: "Executive Staff", scope: "ALL", permissions: { create: [{ module: "leads", actions: ["view", "create", "edit", "export"] }] } } });
  roleId = role.id;
  const email = `lfields-${stamp}@places.test`;
  userId = (await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } })).id;
  person = await session(email);
  leadId = (await prisma.lead.create({ data: {
    code: `L-LF${stamp}`, name: `${P} عميل`, phones: [phone], area: "التجمع الخامس", type: "Rent", space: 100, condition: "متشطب", budget: "100000",
    channel: "Facebook", campaignId, note: "ملاحظة سرية", createdById: "e2e",
  } })).id;
  unitId = (await prisma.unit.create({ data: {
    code: `U-LF${stamp}`, type: "Rent", project: `${P} مشروع`, area: "التجمع الخامس", space: 100, condition: "متشطب", floor: "3",
    pricePerSqm: "1000", totalPrice: "100000", pdfStatus: "confirmed",
  } })).id;
});
after(async () => {
  const leads = (await prisma.lead.findMany({ where: { name: { startsWith: P } }, select: { id: true } })).map((l) => l.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [roleId, ...leads] } }, { userId }, ...leads.map((id) => ({ after: { path: ["leadId"], equals: id } }))] } });
  await prisma.lead.deleteMany({ where: { id: { in: leads } } });
  await prisma.unit.deleteMany({ where: { code: `U-LF${stamp}` } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

const fields = (body: object) => call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body });
const row = async (cookie: string, query: string) =>
  ((await call(`/leads?pageSize=100&${query}`, { cookie })).body as { items: Record<string, unknown>[] }).items.find((l) => l.id === leadId);
/** Every file of a zip (the Excel export) as text. */
function zipText(b: Buffer): string {
  const end = b.length - 22;
  let at = b.readUInt32LE(end + 16), text = "";
  for (let i = b.readUInt16LE(end + 10); i > 0; i--) {
    const len = b.readUInt16LE(at + 28), size = b.readUInt32LE(at + 20), local = b.readUInt32LE(at + 42);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28), data = b.subarray(start, start + size);
    text += (b.readUInt16LE(at + 10) === 8 ? inflateRawSync(data) : data).toString("utf8");
    at += 46 + len + b.readUInt16LE(at + 30) + b.readUInt16LE(at + 32);
  }
  return text;
}
const excel = async (cookie: string) => zipText(Buffer.from(await (await fetch(`${API}/leads/export?q=${encodeURIComponent(P)}`, { headers: { cookie } })).arrayBuffer()));

test("the lead's identity can't be hidden, nor what a role that creates must type; the rules are set", async () => {
  assert.equal((await fields({ module: "leads", rules: { stage: "read" } })).status, 400);
  assert.equal((await fields({ module: "leads", rules: { phones: "hide" } })).status, 400); // the role creates leads
  assert.equal((await fields({ module: "leads", rules: { budget: "hide", note: "hide", campaign: "hide", company: "read", space: "read" } })).status, 204);
  assert.equal((await fields({ module: "inventory", rules: { pricePerSqm: "hide", floor: "hide" } })).status, 204);
});

test("a hidden lead field never leaves the API, and a filter on it is dropped", async () => {
  // the campaign filter is dropped for the person (it would tell the campaign), applied for the admin
  const r = await row(person, `q=${encodeURIComponent(P)}&campaignId=nope`);
  assert.ok(r, "the campaign filter is dropped");
  assert.deepEqual([r.budget, r.campaign, r.channel, r.space], [null, null, "Facebook", 100]);
  assert.equal(await row(admin, `q=${encodeURIComponent(P)}&campaignId=nope`), undefined);
  const d = (await call(`/leads/${leadId}`, { cookie: person })).body as Record<string, unknown>;
  assert.deepEqual([d.budget, d.note, d.campaign, d.post, d.space, d.condition], [null, null, null, null, 100, "متشطب"]);
  const board = (await call(`/leads/board?q=${encodeURIComponent(P)}`, { cookie: person })).body as { lanes: { items: Record<string, unknown>[] }[] };
  assert.equal(board.lanes.flatMap((l) => l.items).find((l) => l.id === leadId)?.budget, null);
  // Excel: no Budget / Campaign column for the person
  const [mine, theirs] = await Promise.all([excel(person), excel(admin)]);
  assert.match(theirs, /100000\.00/);
  assert.match(theirs, /Campaign/);
  assert.doesNotMatch(mine, /100000\.00|Budget|Campaign/);
  assert.match(mine, /Facebook/);
});

test("the units shown from a lead follow the inventory's rules: no hidden price or floor, no question on them", async () => {
  // «الدور الأرضي بس» would leave out the unit on the 3rd floor: for the person the floor is hidden, so it isn't applied
  assert.equal((await call(`/leads/${leadId}/answers`, { method: "PUT", cookie: person, body: { floor: "ground" } })).status, 200);
  const recs = async (cookie: string) => (await call(`/leads/${leadId}/recommendations`, { cookie })).body as { client: Record<string, unknown>; items: Record<string, unknown>[] };
  const mine = await recs(person);
  assert.equal(mine.client.budget, null);
  const u = mine.items.find((x) => x.id === unitId);
  assert.ok(u, "the floor question isn't applied");
  assert.deepEqual([u.price, u.floor, u.space], [null, null, 100]);
  assert.equal((await recs(admin)).items.find((x) => x.id === unitId), undefined, "the admin's list is narrowed by the floor");
  // the client's list goes out from the person (the price and floor aren't on it)
  const res = await fetch(`${API}/leads/${leadId}/unit-list`, { method: "POST", headers: { "content-type": "application/json", cookie: person }, body: JSON.stringify({ unitIds: [unitId] }) });
  assert.equal(res.status, 200);
});

test("a save keeps what the person may not change; a new lead starts it empty", async () => {
  const body = { name: `${P} عميل`, kind: "client", phones: [phone], area: "التجمع الخامس", type: "Rent", space: 200, condition: "نص تشطيب", budget: "1", note: "اتغيرت", company: `${P} شركة` };
  assert.equal((await call(`/leads/${leadId}`, { method: "PUT", cookie: person, body })).status, 200);
  const saved = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.deepEqual([saved.budget?.toFixed(2), saved.note, saved.space, saved.companyId, saved.condition], ["100000.00", "ملاحظة سرية", 100, null, "نص تشطيب"]);
  const made = await call("/leads", { method: "POST", cookie: person, body: { ...body, name: `${P} جديد`, phones: [phone2], channel: "Facebook", campaignId, space: 50, budget: "5000" } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: (made.body as { id: string }).id }, include: { activities: true } });
  assert.deepEqual([lead.budget, lead.note, lead.space, lead.campaignId, lead.companyId, lead.condition], [null, null, null, null, null, "نص تشطيب"]);
  assert.ok(!lead.activities.some((a) => a.text === "اتغيرت"), "the hidden note isn't written as a comment either");
});

test("a role that doesn't create can have the mobile hidden: not shown, not searchable, kept on a save", async () => {
  await prisma.rolePermission.update({ where: { roleId_module: { roleId, module: "leads" } }, data: { actions: ["view", "edit"] } });
  assert.equal((await fields({ module: "leads", rules: { phones: "hide" } })).status, 204);
  assert.equal(await row(person, `q=${phone}`), undefined, "the search doesn't look at a hidden mobile");
  assert.ok(await row(admin, `q=${phone}`));
  assert.deepEqual((await row(person, `q=${encodeURIComponent(P)}`))?.phones, []);
  // the form has no mobile now: left out (or sent anyway), it stays as it is
  const body = { name: `${P} عميل`, kind: "client", area: "التجمع الخامس", type: "Rent" };
  assert.equal((await call(`/leads/${leadId}`, { method: "PUT", cookie: person, body })).status, 200);
  assert.equal((await call(`/leads/${leadId}`, { method: "PUT", cookie: person, body: { ...body, phones: ["01011111111"] } })).status, 200);
  assert.deepEqual((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).phones, [phone]);
});
