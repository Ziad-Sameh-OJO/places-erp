/**
 * 2.28 · «تصدير الوحدات» (M-03, M-12 0.11): the units sheet as .xlsx — the screen's filters, the reader's scope (no
 * draft for who doesn't keep the inventory, Q15), a field hidden from the reader has no column (M-09), audited, and
 * only for `inventory: export`. Manar = inventory (exports) · Mohamed Mohsen = sales (no export → 403) · a throwaway
 * role with «inventory: view · export» and the agent and the price hidden.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { API, PW, call, session } from "./helpers.ts";

const START = new Date();
const stamp = String(START.getTime());
const P = `E2E unit export ${stamp}`;
const KEY = `e2e-unit-export-${stamp}`;
let admin: string, manar: string, sales: string, person: string, roleId: string, userId: string, agentName: string;
const ids: string[] = [];

before(async () => {
  [admin, manar, sales] = await Promise.all(["ahmed.islam@places.com", "manar.ahmed@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const role = await prisma.role.create({ data: { key: KEY, label: `E2E unit export ${stamp}`, tier: "Executive Staff", scope: "ALL", permissions: { create: [{ module: "inventory", actions: ["view", "export"] }] } } });
  roleId = role.id;
  const email = `unit-export-${stamp}@places.test`;
  userId = (await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } })).id;
  person = await session(email);
  const agent = await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } }, select: { id: true, name: true } });
  agentName = agent.name;
  // U-101 from the demo (95 m at 1,100 a month in Mivida), confirmed; and a Resale draft only the inventory team sees
  for (const [body, confirmed] of [
    [{ type: "Rent", project: `${P} Mivida`, area: "التجمع الخامس", space: 95, condition: "متشطب", floor: "2", parking: 1, agentId: agent.id, pricePerSqm: "1100", lastOwnerUpdateAt: "2026-11-01" }, true],
    [{ type: "Resale", project: `${P} Zayed Hub`, area: "الشيخ زايد", space: 85, condition: "متشطب", agentId: agent.id, pricePerSqm: "36000", paymentMethod: "كاش" }, false],
  ] as const) {
    const r = await call("/inventory/units", { method: "POST", cookie: manar, body });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = (r.body as { id: string }).id;
    ids.push(id);
    if (confirmed) await prisma.unit.update({ where: { id }, data: { pdfStatus: "confirmed" } });
  }
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ entity: "Unit", entityId: { in: ids } }, { userId }, { entityId: roleId }, { entity: "Unit", entityId: "export", at: { gte: START }, after: { path: ["filters", "q"], equals: P } }] } });
  const owners = (await prisma.unit.findMany({ where: { id: { in: ids } }, select: { ownerId: true } })).flatMap((u) => (u.ownerId ? [u.ownerId] : []));
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  await prisma.client.deleteMany({ where: { id: { in: owners } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

/** The sheet as rows of plain values, header first. */
async function sheet(path: string, cookie: string) {
  const res = await fetch(`${API}${path}`, { headers: { cookie } });
  assert.equal(res.status, 200, await res.clone().text());
  assert.match(res.headers.get("content-type") ?? "", /spreadsheetml/);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
  const rows: unknown[][] = [];
  book.worksheets[0]!.eachRow((r) => rows.push((r.values as unknown[]).slice(1)));
  return rows;
}
const q = `/inventory/units/export?q=${encodeURIComponent(P)}`;

test("Manar: the filtered sheet with the demo's columns, drafts too; audited", async () => {
  const rows = await sheet(q, manar);
  assert.deepEqual(rows[0], ["Code", "Type", "Project", "Area", "Space", "Floor", "Condition", "Total", "Agent", "Status", "Last update"]);
  assert.equal(rows.length, 3);
  const rent = rows.find((r) => r[2] === `${P} Mivida`)!;
  assert.deepEqual(rent.slice(1), ["Rent", `${P} Mivida`, "التجمع الخامس", 95, "2", "متشطب", 104500, agentName, "Available", "2026-11-01"]);
  assert.ok(rows.some((r) => r[2] === `${P} Zayed Hub`), "the draft is the inventory team's to see");
  // the screen's filters: the Rent tab only
  const onlyRent = await sheet(`${q}&type=Rent`, manar);
  assert.deepEqual(onlyRent.slice(1).map((r) => r[2]), [`${P} Mivida`]);
  const log = await prisma.auditLog.findFirst({ where: { entity: "Unit", entityId: "export", action: "export", at: { gte: START }, after: { path: ["filters", "q"], equals: P } }, orderBy: { at: "asc" } });
  assert.deepEqual((log?.after as { rows: number } | null)?.rows, 2);
});

test("a hidden field has no column; the scope is the screen's (no draft); sales without «export» get 403", async () => {
  assert.equal((await call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie: admin, body: { module: "inventory", rules: { agent: "hide", pricePerSqm: "hide" } } })).status, 204);
  person = await session(`unit-export-${stamp}@places.test`); // the rules come with the session's user
  const rows = await sheet(q, person);
  assert.deepEqual(rows[0], ["Code", "Type", "Project", "Area", "Space", "Floor", "Condition", "Status", "Last update"]);
  assert.deepEqual(rows.slice(1).map((r) => r[2]), [`${P} Mivida`]);
  assert.ok(!rows.flat().includes(agentName), "the agent never reaches the file");
  assert.equal((await fetch(`${API}${q}`, { headers: { cookie: sales } })).status, 403);
  assert.equal((await fetch(`${API}${q}`)).status, 401);
});
