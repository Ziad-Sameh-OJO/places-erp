/**
 * M-09 field permissions on the Done Deals against the real API: a hidden field's value never leaves the API (list,
 * details, sheet, Excel), a search on it is dropped, a save keeps what the person may not change, a create starts it
 * empty, and the unit picker follows the inventory's rules. Its own role and person (deals: view, create, edit,
 * approve, export), so the seeded roles other files use stay as they are. Ibrahim (sales) closes deal A, Nancy (Office
 * Manager) approves it; the person registers and reviews deal B.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { API, PW, call, session } from "./helpers.ts";
import { cleanFinance } from "./finance-helpers.ts";

const stamp = String(Date.now());
const C = `E2E-FLD ${stamp}`;
const LOC = `LOC${stamp}`;
const KEY = `e2e-deal-fields-${stamp}`;
const since = new Date();
let admin: string, sales: string, nancy: string, person: string, roleId: string, userId: string;
let dealA: string, dealB: string, leadB: string, unitB: string;

before(async () => {
  [admin, sales, nancy] = await Promise.all(["ahmed.islam@places.com", "ibrahim.samir@places.com", "nancy.islam@places.com"].map((e) => session(e)));
  const role = await prisma.role.create({ data: { key: KEY, label: `E2E deal fields ${stamp}`, tier: "Executive Staff", scope: "ALL",
    permissions: { create: [{ module: "deals", actions: ["view", "create", "edit", "approve", "export"] }] } } });
  roleId = role.id;
  const email = `deal-fields-${stamp}@places.test`;
  userId = (await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } })).id;
  person = await session(email);
  const m = await prisma.employee.findFirstOrThrow({ where: { user: { email: "ibrahim.samir@places.com" } } });
  const agent = await prisma.employee.findFirstOrThrow({ where: { user: { email: "abdelrahman.salah@places.com" } } });
  const lead = (n: string) => prisma.lead.create({ data: {
    code: `L-F${n}${stamp}`, name: `${C} عميل ${n}`, phones: [`010${n === "A" ? 6 : 7}${stamp.slice(-7)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    assignedToId: m.id, assignedAt: new Date(), createdById: "e2e", stage: "NEAR_TO_CLOSE", qualified: true, createdAt: new Date(Date.now() - 3 * 24 * 3_600_000),
  } });
  const unit = (n: string) => prisma.unit.create({ data: { code: `U-F${n}${stamp}`, type: "Rent", project: `${LOC} مشروع ${n}`, area: "التجمع الخامس", space: 200, condition: "Finished", pdfStatus: "confirmed", agentId: agent.id } });
  const [la, lb, ua, ub] = await Promise.all([lead("A"), lead("B"), unit("A"), unit("B")]);
  leadB = lb.id; unitB = ub.id;
  // the person isn't a salesperson: they close lead B from the Draft, Ibrahim's (an all-scope caller's form offers these)
  await prisma.lead.update({ where: { id: leadB }, data: { assignedToId: null, draft: "draft" } });
  await prisma.leadDraft.create({ data: { leadId: leadB, kind: "draft", fromId: m.id, stage: "NEAR_TO_CLOSE", days: 7 } });
  const r = await call("/deals", { method: "POST", cookie: sales, body: { leadId: la.id, unitId: ua.id, space: 200, type: "Rent", commissionOwner: "50000", commissionClient: "50000", withMe: [] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  dealA = r.body.id;
  assert.equal((await call(`/deals/${dealA}/review`, { method: "POST", cookie: nancy, body: { decision: "approve" } })).status, 200);
  assert.equal((await call(`/deals/${dealA}/note`, { method: "PUT", cookie: nancy, body: { note: `${C} OM note`, targetBase: null } })).status, 200);
});

after(async () => {
  const deals = [dealA, dealB].filter(Boolean);
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...deals, roleId] } }, { userId }] } });
  await cleanFinance(C, since);
  await prisma.deal.deleteMany({ where: { id: { in: deals } } });
  const files = (await prisma.lead.findMany({ where: { code: { in: [`L-FA${stamp}`, `L-FB${stamp}`] }, clientId: { not: null } }, select: { clientId: true } })).map((l) => l.clientId!);
  const leads = (await prisma.lead.findMany({ where: { code: { in: [`L-FA${stamp}`, `L-FB${stamp}`] } }, select: { id: true } })).map((l) => l.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: leads } } });
  await prisma.lead.deleteMany({ where: { id: { in: leads } } });
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: files } } });
  await prisma.client.deleteMany({ where: { id: { in: files }, leads: { none: {} }, units: { none: {} } } });
  await prisma.unit.deleteMany({ where: { code: { in: [`U-FA${stamp}`, `U-FB${stamp}`] } } });
  await prisma.notification.deleteMany({ where: { text: { contains: C } } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

const fields = (body: object) => call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body });
/** Every text in a zip (the .xlsx). */
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
const xlsx = async (cookie: string) => zipText(Buffer.from(await (await fetch(`${API}/deals/export`, { headers: { cookie } })).arrayBuffer()));

test("the admin sets the deal fields; identity can't be hidden, nor what the role's create form needs", async () => {
  assert.equal((await fields({ module: "deals", rules: { code: "hide" } })).status, 400);
  assert.equal((await fields({ module: "deals", rules: { commissionOwner: "hide" } })).status, 400); // the role creates deals
  assert.equal((await fields({ module: "deals", rules: { location: "hide", source: "hide", shares: "hide", commissionOwner: "read", space: "read", note: "read", execution: "hide" } })).status, 204);
  assert.equal((await fields({ module: "inventory", rules: { space: "hide", agent: "hide" } })).status, 204);
});

test("a hidden field never leaves the API: list, details, sheet, Excel; a search on it is dropped", async () => {
  const list = (await call("/deals?pageSize=100", { cookie: person })).body as { items: Record<string, unknown>[] };
  const row = list.items.find((x) => x.id === dealA)!;
  assert.ok(row);
  assert.deepEqual([row.location, row.commissionOwner, row.space, row.note, row.execDueAt], ["", "50000.00", 200, `${C} OM note`, null]);
  const detail = (await call(`/deals/${dealA}`, { cookie: person })).body as Record<string, unknown>;
  assert.deepEqual([detail.location, detail.source, detail.company], ["", "", `${C} عميل A`]);
  const sheet = (await call("/deals/sheet", { cookie: person })).body as { items: Record<string, unknown>[]; totals: Record<string, string> };
  const s = sheet.items.find((x) => x.id === dealA)!;
  assert.deepEqual([s.location, s.source, s.shares], ["", "", []]);
  assert.equal(sheet.totals.commission, "");
  // the location isn't searched for them (a match would tell it); Nancy finds it
  assert.ok(!((await call(`/deals?q=${LOC}`, { cookie: person })).body.items as { id: string }[]).some((x) => x.id === dealA));
  assert.ok(((await call(`/deals?q=${LOC}`, { cookie: nancy })).body.items as { id: string }[]).some((x) => x.id === dealA));
  const mine = await xlsx(person), theirs = await xlsx(nancy);
  assert.ok(theirs.includes(LOC) && theirs.includes("buyer commission"));
  assert.ok(!mine.includes(LOC) && !mine.includes("buyer commission") && !mine.includes(">location<") && mine.includes(C));
});

test("a save keeps what the person may not change; a hidden field can't be set", async () => {
  // the note is read only: their note doesn't replace the Office Manager's
  const n = await call(`/deals/${dealA}/note`, { method: "PUT", cookie: person, body: { note: "changed", targetBase: null } });
  assert.equal(n.status, 200, JSON.stringify(n.body));
  assert.equal((await prisma.deal.findUniqueOrThrow({ where: { id: dealA } })).note, `${C} OM note`);
  // the execution date is hidden: setting it is refused
  assert.equal((await call(`/deals/${dealA}/execution`, { method: "PUT", cookie: person, body: { execDueAt: "2026-12-01" } })).status, 403);
  assert.equal((await prisma.deal.findUniqueOrThrow({ where: { id: dealA } })).execDueAt, null);
});

test("a create starts the read-only fields empty (or as the unit has them); the review keeps them", async () => {
  const r = await call("/deals", { method: "POST", cookie: person, body: { leadId: leadB, unitId: unitB, space: 5, type: "Rent", commissionOwner: "99999", commissionClient: "1000", withMe: [] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  dealB = r.body.id;
  let d = await prisma.deal.findUniqueOrThrow({ where: { id: dealB } });
  assert.deepEqual([d.commissionOwner.toFixed(2), d.commissionClient.toFixed(2), d.space], ["0.00", "1000.00", 0]); // the unit's space is hidden from them too
  const v = await call(`/deals/${dealB}/review`, { method: "POST", cookie: person, body: { decision: "approve", space: 7, commissionOwner: "5", commissionClient: "2000", location: "X" } });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  d = await prisma.deal.findUniqueOrThrow({ where: { id: dealB } });
  assert.deepEqual([d.commissionOwner.toFixed(2), d.commissionClient.toFixed(2), d.space, d.location], ["0.00", "2000.00", 0, `${LOC} مشروع B`]);
});

test("the deal form's unit picker follows the inventory's field rules", async () => {
  // space and agent are hidden from the role in the inventory: not sent with the open units
  const open = (await call("/deals/units", { cookie: person })).body as Array<{ space: number; agent: unknown }>;
  assert.ok(open.length > 0 && open.every((u) => u.space === 0 && u.agent === null));
  const theirs = (await call("/deals/units", { cookie: sales })).body as Array<{ space: number }>;
  assert.ok(theirs.some((u) => u.space > 0));
});
