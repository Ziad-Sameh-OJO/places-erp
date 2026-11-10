/**
 * M-09 field permissions against the real API, on the units (phase 1): the admin sets, field by field, what a role sees —
 * shown, read only or hidden. A hidden field's value never leaves the API (sheet, details, PowerPoint), a filter on it
 * is dropped, and a save keeps what the person may not change. Its own role and person, so the seeded roles other test
 * files use stay as they are. Ahmed Islam = Super Admin, Mohamed Mohsen = sales (no access: edit), Manar = inventory.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { API, PW, call, session } from "./helpers.ts";

const stamp = Date.now();
const P = `E2E ${stamp} FIELDS`;
const KEY = `e2e-fields-${stamp}`;
let admin: string, sales: string, manar: string, person: string, roleId: string, userId: string, unitId: string;

before(async () => {
  [admin, sales, manar] = await Promise.all(["ahmed.islam@places.com", "m.mohsen@places.com", "manar.ahmed@places.com"].map((e) => session(e)));
  // a role that keeps the inventory (so the requirements' own rule shows it the owner's number) and one person on it
  const role = await prisma.role.create({ data: { key: KEY, label: `E2E fields ${stamp}`, tier: "Executive Staff", scope: "ALL", permissions: { create: [{ module: "inventory", actions: ["view", "create", "edit"] }] } } });
  roleId = role.id;
  const email = `fields-${stamp}@places.test`;
  const u = await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } });
  userId = u.id;
  person = await session(email);
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: roleId }, { userId }, { entity: "Unit", entityId: unitId ?? "" }] } });
  await prisma.unit.deleteMany({ where: { project: { startsWith: P } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

const fields = (cookie: string, body: object) => call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie, body });
/** U-101 from the demo, with an owner, a price and a commission */
const unit = (extra: object = {}) => ({
  type: "Rent", project: `${P} Mivida`, area: "التجمع الخامس", space: 95, condition: "متشطب", floor: "2", parking: 1,
  ownerName: "أ. سمير", ownerPhone: "01000000777", pricePerSqm: "1100", commission: "شهر", ...extra,
});
function pptxText(b: Buffer): string {
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

test("the admin sets a role's fields; the unit's identity can't be hidden; others can't change them", async () => {
  assert.equal((await fields(admin, { module: "inventory", rules: { ownerPhone: "hide", pricePerSqm: "hide", commission: "read", floor: "show" } })).status, 204);
  assert.deepEqual((await call(`/access/roles/${KEY}/fields`, { cookie: admin })).body, { inventory: { ownerPhone: "hide", pricePerSqm: "hide", commission: "read" } });
  const log = await prisma.auditLog.findFirst({ where: { entityId: roleId, action: "fields" } });
  assert.deepEqual(log?.after, { module: "inventory", rules: { ownerPhone: "hide", pricePerSqm: "hide", commission: "read" } });
  assert.equal((await fields(admin, { module: "inventory", rules: { project: "hide" } })).status, 400);
  assert.equal((await fields(admin, { module: "inventory", rules: { nope: "hide" } })).status, 400);
  assert.equal((await fields(admin, { module: "inventory", rules: { floor: "gone" } })).status, 400);
  assert.equal((await fields(sales, { module: "inventory", rules: {} })).status, 403);
  // the person on the role learns their rules with who they are (the screens follow them)
  assert.deepEqual(((await call("/auth/me", { cookie: person })).body as { fields: object }).fields, { inventory: { ownerPhone: "hide", pricePerSqm: "hide", commission: "read" } });
});

test("a hidden field never leaves the API; a filter on it is dropped; a save keeps what the person may not change", async () => {
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: unit() });
  assert.equal(r.status, 201);
  unitId = (r.body as { id: string }).id;
  // the sheet and the details: no owner number, no price or total; the read-only commission is shown
  const list = (await call(`/inventory/units?q=${encodeURIComponent(P)}&minPrice=999999999`, { cookie: person })).body as { items: Record<string, unknown>[] };
  const row = list.items.find((x) => x.id === unitId);
  assert.ok(row, "the price filter is dropped: it would tell the price");
  assert.deepEqual([row.ownerPhone, row.pricePerSqm, row.totalPrice, row.commission, row.floor], [null, null, null, "شهر", "2"]);
  const detail = (await call(`/inventory/units/${unitId}`, { cookie: person })).body as Record<string, unknown>;
  assert.deepEqual([detail.ownerPhone, detail.pricePerSqm, detail.ownerName], [null, null, "أ. سمير"]);
  // the unit's PowerPoint: Manar's has the rate, the person's not
  const deck = async (cookie: string) => pptxText(Buffer.from(await (await fetch(`${API}/inventory/units/${unitId}/pdf/pptx`, { headers: { cookie } })).arrayBuffer()));
  assert.match(await deck(manar), /EGP 1,100/);
  assert.doesNotMatch(await deck(person), /1,100/);
  // the person saves the whole sheet: the price, number and commission they sent are ignored, the floor is saved
  const put = await call(`/inventory/units/${unitId}`, { method: "PUT", cookie: person, body: unit({ floor: "5", pricePerSqm: "1", ownerPhone: "01000000999", commission: "شهرين" }) });
  assert.equal(put.status, 200);
  const saved = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
  assert.deepEqual([saved.floor, saved.pricePerSqm?.toFixed(2), saved.ownerPhone, saved.commission], ["5", "1100.00", "01000000777", "شهر"]);
  // a new unit from the person: what they may not set starts empty — but the owner's number is entered by whoever adds
  // the unit even when it's hidden from them (2.36: write, not read)
  const mine = await call("/inventory/units", { method: "POST", cookie: person, body: unit({ project: `${P} Waterway` }) });
  assert.equal(mine.status, 201);
  const made = await prisma.unit.findUniqueOrThrow({ where: { id: (mine.body as { id: string }).id } });
  assert.deepEqual([made.pricePerSqm, made.ownerPhone, made.commission, made.floor], [null, "01000000777", null, "2"]);
});
