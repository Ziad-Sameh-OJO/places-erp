/**
 * 2.20 · a unit's missing data: «ناقص N» on the row and the unit, the «ناقصها بيانات» filter and tile, and the lines
 * on «مهامي النهارده» (Manar the Rent units, Randa Resale and Income) until the columns are filled.
 * Manar = inventory, Randa = resale, Mohamed Mohsen = sales, Basant = HR (no inventory).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const P = `E2E missing ${Date.now()}`;
let manar: string, randa: string, sales: string, hr: string, agentId: string;

before(async () => {
  [manar, randa, sales, hr] = await Promise.all(
    ["manar.ahmed@places.com", "randa.mohamed@places.com", "m.mohsen@places.com", "basant.elsawy@places.com"].map((e) => session(e)),
  );
  agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
});
after(async () => {
  const units = await prisma.unit.findMany({ where: { project: { startsWith: P } }, select: { id: true, ownerId: true } });
  const ids = units.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  const owners = [...new Set(units.flatMap((u) => (u.ownerId ? [u.ownerId] : [])))];
  const empty = await prisma.client.findMany({ where: { id: { in: owners }, units: { none: {} }, leads: { none: {} } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: empty.map((c) => c.id) } } });
  await prisma.client.deleteMany({ where: { id: { in: empty.map((c) => c.id) } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

/** What the form needs today (2.21 makes the rest optional); maintenance, commission, location and photos left out. */
const rent = (extra: object = {}) => ({
  type: "Rent", project: `${P} Mivida`, area: "التجمع الخامس", space: 95, condition: "متشطب", building: "B4", agentId,
  ownerName: "أ. سمير", ownerPhone: "01000000101", pricePerSqm: "1100", ...extra,
});

type Today = { units: { id: string; code: string; missing: string[] }[]; total: number };
const today = async (cookie: string) => {
  const r = await call("/home/inventory", { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as Today;
};
const listed = async (cookie: string, missing: boolean) => {
  const r = await call(`/inventory/units?q=${encodeURIComponent(P)}&missing=${missing}`, { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (r.body as { items: { code: string; missing: string[] }[] }).items;
};

test("the home lines are the inventory's: HR is refused, sales get none", async () => {
  assert.equal((await call("/home/inventory", { cookie: hr })).status, 403);
  assert.deepEqual(await today(sales), { units: [], total: 0 });
});

test("a unit saved with empty columns says what's missing until they are filled", async () => {
  const r = await call("/inventory/units", { method: "POST", cookie: manar, body: rent() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const { id, code } = r.body as { id: string; code: string };

  const unit = (await call(`/inventory/units/${id}`, { cookie: manar })).body as { missing: string[] };
  assert.deepEqual(unit.missing, ["Pic & Info", "Maintenance", "Commission", "Location"]);
  assert.deepEqual((await listed(manar, true)).map((u) => u.code), [code]);
  assert.deepEqual(await listed(manar, false), []);
  const summary = (await call("/inventory/units/summary", { cookie: manar })).body as { missing: number };
  assert.ok(summary.missing >= 1);

  // Manar's board has Rent units only, Randa's never a Rent one (others' tests add units meanwhile, so by type)
  const types = async (t: Today) => (await prisma.unit.findMany({ where: { id: { in: t.units.map((u) => u.id) } }, select: { type: true } })).map((u) => u.type);
  const mine = await today(manar), randas = await today(randa);
  assert.ok(mine.total >= 1);
  assert.ok((await types(mine)).every((t) => t === "Rent" || t === "Primary"));
  assert.ok((await types(randas)).every((t) => t === "Resale" || t === "Income"));
  assert.ok(mine.units.length <= 5);

  // filled: only the photo folder is left, then a photo (put straight in: the upload needs file storage) clears it
  const put = await call(`/inventory/units/${id}`, { method: "PUT", cookie: manar, body: rent({ maintenance: "15 / م", commission: "شهر", location: "30.02, 31.48" }) });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.deepEqual((put.body as { missing: string[] }).missing, ["Pic & Info"]);
  const manarUser = (await prisma.user.findUniqueOrThrow({ where: { email: "manar.ahmed@places.com" } })).id;
  const file = await prisma.file.create({ data: { key: `e2e/${P}.png`, name: `${P}.png`, mime: "image/png", size: 10, status: "READY", uploadedById: manarUser } });
  await prisma.unitPhoto.create({ data: { unitId: id, fileId: file.id, position: 0 } });
  try {
    assert.deepEqual(((await call(`/inventory/units/${id}`, { cookie: manar })).body as { missing: string[] }).missing, []);
    assert.deepEqual(await listed(manar, true), []);
    assert.ok(!(await today(manar)).units.some((u) => u.id === id));
  } finally {
    await prisma.unitPhoto.deleteMany({ where: { fileId: file.id } });
    await prisma.file.delete({ where: { id: file.id } });
  }
});
