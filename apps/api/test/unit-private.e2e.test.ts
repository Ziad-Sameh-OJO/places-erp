/**
 * 2.36 · the unit's owner (Contact / Number) and Agent are Manar's (Inventory Manager) only — even the Super Admin and
 * Randa don't see them: not in the list, the unit, the search or the export, and an edit can't change them. Entering
 * them on a new unit is still allowed (write, not read). They are M-09 field rules, so the admin can show them later.
 * Manar = inventory, Randa = resale, Ahmed Islam = Super Admin, Mohamed Mohsen = sales.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { prisma } from "@places/db";
import { API, call, session } from "./helpers.ts";

const P = `E2E private ${Date.now()}`;
let manar: string, randa: string, admin: string, sales: string, agentId: string;

before(async () => {
  [manar, randa, admin, sales] = await Promise.all(
    ["manar.ahmed@places.com", "randa.mohamed@places.com", "ahmed.islam@places.com", "m.mohsen@places.com"].map((e) => session(e)),
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

const OWNER = `أ. سمير ${Date.now()}`, PHONE = "01000003601";
const resale = (extra: object = {}) => ({
  type: "Resale", project: `${P} Zayed`, space: 85, ownerName: OWNER, ownerPhone: PHONE, agentId, pricePerSqm: "36000", ...extra,
});
type Row = { id: string; code: string; ownerName: string | null; ownerPhone: string | null; agent: { id: string } | null };
const items = async (cookie: string, q: string) => {
  const r = await call(`/inventory/units?q=${encodeURIComponent(q)}&pageSize=50`, { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return (r.body as { items: Row[] }).items;
};

test("Randa enters the owner and agent on a new unit, then only Manar sees them (list, unit, search)", async () => {
  const r = await call("/inventory/units", { method: "POST", cookie: randa, body: resale() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = (r.body as { id: string }).id;
  // written (write, not read)
  const stored = await prisma.unit.findUniqueOrThrow({ where: { id } });
  assert.deepEqual([stored.ownerName, stored.ownerPhone, stored.agentId], [OWNER, PHONE, agentId]);
  await prisma.unit.update({ where: { id }, data: { pdfStatus: "confirmed" } });

  // Manar sees them, and finds the unit by the owner's name and number
  const m = (await call(`/inventory/units/${id}`, { cookie: manar })).body as Row;
  assert.deepEqual([m.ownerName, m.ownerPhone, m.agent?.id], [OWNER, PHONE, agentId]);
  assert.deepEqual((await items(manar, OWNER)).map((u) => u.id), [id]);
  assert.deepEqual((await items(manar, PHONE)).map((u) => u.id), [id]);

  // Randa, the Super Admin and sales don't: blank in the unit and the list, and the search doesn't tell
  for (const cookie of [randa, admin, sales]) {
    const u = (await call(`/inventory/units/${id}`, { cookie })).body as Row;
    assert.deepEqual([u.ownerName, u.ownerPhone, u.agent], [null, null, null]);
    const row = (await items(cookie, P)).find((x) => x.id === id)!;
    assert.deepEqual([row.ownerName, row.ownerPhone, row.agent], [null, null, null]);
    assert.deepEqual(await items(cookie, OWNER), []);
    assert.deepEqual(await items(cookie, PHONE), []);
  }
  // the «كل الـ agents» filter is dropped for them
  assert.ok((await items(randa, P)).length >= 1);
  const filtered = await call(`/inventory/units?q=${encodeURIComponent(P)}&agentId=nobody`, { cookie: randa });
  assert.ok((filtered.body as { items: Row[] }).items.some((x) => x.id === id));

  // an edit by Randa can't change them (the stored values stay); Manar's can
  const put = await call(`/inventory/units/${id}`, { method: "PUT", cookie: randa, body: resale({ ownerName: "حد تاني", ownerPhone: "01000003699", agentId: null, floor: "3" }) });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const after1 = await prisma.unit.findUniqueOrThrow({ where: { id } });
  assert.deepEqual([after1.ownerName, after1.ownerPhone, after1.agentId, after1.floor], [OWNER, PHONE, agentId, "3"]);
  assert.equal((await call(`/inventory/units/${id}`, { method: "PUT", cookie: manar, body: resale({ ownerName: "أ. نبيل" }) })).status, 200);
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id } })).ownerName, "أ. نبيل");
});

test("the export leaves the Agent column out for the Super Admin; Manar's file has it", async () => {
  const header = async (cookie: string) => {
    const res = await fetch(`${API}/inventory/units/export?q=${encodeURIComponent(P)}`, { headers: { cookie } });
    assert.equal(res.status, 200, await res.clone().text());
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
    return (book.worksheets[0]!.getRow(1).values as unknown[]).slice(1);
  };
  assert.ok((await header(manar)).includes("Agent"));
  assert.ok(!(await header(admin)).includes("Agent"));
});
