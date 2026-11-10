/**
 * M-09 field permissions against the real API, on the ops modules: the campaigns (marketing), the tasks, the Not Active
 * sheets and the targets (reports). A hidden field's value never leaves the API, a save keeps what the person may not
 * change, a new record starts it empty. Its own role and person, so the seeded roles other test files use stay as they
 * are. Ahmed Islam = Super Admin, Mohamed Mohsen = sales, Rahma = marketing, Bayoumi = photographer.
 * No filter of these modules is on a field in their catalogs (campaigns have none; tasks filter by kind and assignee,
 * Not Active by status, the targets by month): there's no filter to drop.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "@node-rs/argon2";
import { prisma } from "@places/db";
import { PW, call, session } from "./helpers.ts";

const stamp = Date.now();
const P = `E2E ${stamp} OPS`;
const KEY = `e2e-fields-ops-${stamp}`;
const MONTH = "2031-01"; // a coming month: a target there changes at once (11.8)
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
let admin: string, sales: string, person: string, roleId: string, userId: string, channel: string;
let rahmaId: string, bayoumiId: string, unitId: string, sheetId: string, salesIds: string[];
const campaignIds: string[] = [], taskIds: string[] = [];

before(async () => {
  [admin, sales] = await Promise.all(["ahmed.islam@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  const role = await prisma.role.create({ data: { key: KEY, label: `E2E fields ops ${stamp}`, tier: "Executive Staff", scope: "ALL", permissions: { create: [
    { module: "marketing", actions: ["view", "create", "edit"] }, { module: "tasks", actions: ["view", "create", "edit"] },
    { module: "notactive", actions: ["view", "edit", "approve"] }, { module: "reports", actions: ["view", "edit", "approve"] },
  ] } } });
  roleId = role.id;
  const email = `fields-ops-${stamp}@places.test`;
  userId = (await prisma.user.create({ data: { email, status: "ACTIVE", passwordHash: await hash(PW), roles: { create: [{ roleId, primary: true }] } } })).id;
  person = await session(email);
  await prisma.reportsAccess.create({ data: { userId, grantedById: userId } }); // 11.20: a head opened «التقارير والتارجت» for this role's person
  channel = ((await call("/marketing/campaigns/channels", { cookie: admin })).body as string[])[0]!;
  const id = async (e: string) => (await prisma.user.findUniqueOrThrow({ where: { email: e } })).id;
  [rahmaId, bayoumiId] = await Promise.all([id("rahma.hassan@places.com"), id("abdelrahman.bayoumi@places.com")]);
  unitId = (await prisma.unit.create({ data: { code: `U-F${stamp}`, type: "Rent", project: `${P} مشروع`, area: "التجمع الخامس", space: 120, condition: "Finished", floor: "3", building: "B7", ownerName: "أ. سمير", ownerPhone: "01000000777" } })).id;
  sheetId = (await prisma.notActiveSheet.create({ data: { name: P, dedupeBy: ["الكود"], numberBy: "الرقم", columns: ["الكود", "المالك", "الرقم"] } })).id;
  // not the two reports.e2e works on (it clears their targets while running beside this file)
  salesIds = (await prisma.employee.findMany({ where: { user: { status: "ACTIVE", email: { notIn: ["youssef.hosny@places.com", "ahmed.amr@places.com"] }, roles: { some: { role: { key: "sales" } } } } }, select: { id: true }, orderBy: { name: "asc" }, take: 2 })).map((e) => e.id);
});
after(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [roleId, sheetId, ...campaignIds, ...taskIds, ...salesIds.map((e) => `${e}:${MONTH}`)] } }, { userId }] } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.campaign.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.notActiveSheet.deleteMany({ where: { id: sheetId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.salesTarget.deleteMany({ where: { month: MONTH, employeeId: { in: salesIds } } });
  await prisma.notification.deleteMany({ where: { OR: [{ text: { contains: P } }, { link: { in: taskIds.map((t) => `/tasks?id=${t}`) } }] } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

const fields = (cookie: string, module: string, rules: object) => call(`/access/roles/${KEY}/fields`, { method: "PUT", cookie, body: { module, rules } });

test("the admin sets the ops modules' fields; their identity can't be hidden; sales can't change them", async () => {
  assert.equal((await fields(admin, "marketing", { budget: "hide", spent: "hide", note: "read" })).status, 204);
  assert.equal((await fields(admin, "marketing", { name: "hide" })).status, 400);
  assert.equal((await fields(admin, "tasks", { dueOn: "read" })).status, 400);
  assert.equal((await fields(admin, "tickets", { title: "hide" })).status, 400); // nothing in the tickets to hide
  assert.equal((await fields(sales, "tasks", {})).status, 403);
});

test("campaigns: the budget and what was spent never leave the API; a save keeps them and the read-only note", async () => {
  const body = (extra: object = {}) => ({ name: `${P} كامبين`, channel, startsOn: "2026-11-01", endsOn: "2026-11-30", budget: "5000", spent: "1200", target: "مول التجمع", note: "ملاحظة الإدارة", ...extra });
  const made = await call("/marketing/campaigns", { method: "POST", cookie: admin, body: body() });
  assert.equal(made.status, 201);
  const id = (made.body as { id: string }).id;
  campaignIds.push(id);
  const row = ((await call("/marketing/campaigns", { cookie: person })).body as Record<string, unknown>[]).find((c) => c.id === id)!;
  assert.deepEqual([row.budget, row.spent, row.costPerLead, row.note, row.target], ["", "", null, "ملاحظة الإدارة", "مول التجمع"]);
  assert.equal(((await call("/marketing/campaigns", { cookie: admin })).body as Record<string, unknown>[]).find((c) => c.id === id)!.budget, "5000.00");
  const dash = (await call(`/marketing/campaigns/dashboard?campaignId=${id}`, { cookie: person })).body as { spent: string; costPerQualified: string | null };
  assert.deepEqual([dash.spent, dash.costPerQualified], ["", null]);
  // the whole form back: the budget, cost and note sent are ignored, the target is saved
  assert.equal((await call(`/marketing/campaigns/${id}`, { method: "PUT", cookie: person, body: body({ budget: "1", spent: "2", note: "اتغيّرت", target: "مول جديد" }) })).status, 200);
  const saved = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  assert.deepEqual([saved.budget.toFixed(2), saved.spent.toFixed(2), saved.note, saved.target], ["5000.00", "1200.00", "ملاحظة الإدارة", "مول جديد"]);
  // a new one from the person: what they may not set starts empty
  const mine = await call("/marketing/campaigns", { method: "POST", cookie: person, body: body({ name: `${P} بتاعتي`, budget: "9000", note: "مني" }) });
  assert.equal(mine.status, 201);
  campaignIds.push((mine.body as { id: string }).id);
  const fresh = await prisma.campaign.findUniqueOrThrow({ where: { id: (mine.body as { id: string }).id } });
  assert.deepEqual([fresh.budget.toFixed(2), fresh.spent.toFixed(2), fresh.note, fresh.target], ["0.00", "0.00", null, "مول التجمع"]);
});

test("tasks: the owner and the unit's place never leave the API; the read-only note isn't changed or set", async () => {
  assert.equal((await fields(admin, "tasks", { ownerName: "hide", place: "hide", note: "read" })).status, 204);
  const t = await prisma.task.create({ data: { kind: "photo", unitId, toUserId: bayoumiId, byUserId: rahmaId, dueOn: new Date(`${today}T00:00:00Z`), note: "صوّرها الصبح" } });
  taskIds.push(t.id);
  const row = ((await call("/tasks", { cookie: person })).body as { id: string; note: string | null; unit: Record<string, unknown> }[]).find((x) => x.id === t.id)!;
  assert.deepEqual([row.unit.code, row.unit.ownerName, row.unit.ownerPhone, row.unit.area, row.unit.floor, row.unit.building, row.note], [`U-F${stamp}`, null, null, "", null, null, "صوّرها الصبح"]);
  const one = (await call(`/tasks/${t.id}`, { cookie: person })).body as { unit: Record<string, unknown> };
  assert.deepEqual([one.unit.ownerName, one.unit.area], [null, ""]);
  assert.equal(((await call(`/tasks/${t.id}`, { cookie: admin })).body as { unit: Record<string, unknown> }).unit.ownerName, "أ. سمير");
  // the day moves, the note sent is ignored
  const moved = await call(`/tasks/${t.id}`, { method: "PATCH", cookie: person, body: { dueOn: "2031-01-05", note: "اتغيّرت" } });
  assert.equal(moved.status, 200);
  const saved = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
  assert.deepEqual([saved.note, saved.dueOn.toISOString().slice(0, 10)], ["صوّرها الصبح", "2031-01-05"]);
  // a marketing task from the person: its note starts empty
  const given = await call("/tasks", { method: "POST", cookie: person, body: { kind: "marketing", toUserId: rahmaId, dueOn: today, title: "Website leasing", note: "مني" } });
  assert.equal(given.status, 201);
  taskIds.push((given.body as { id: string }).id);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: (given.body as { id: string }).id } })).note, null);
});

test("Not Active: the owner's number column never leaves the API; the read-only feedback stays, a hidden one is blank", async () => {
  assert.equal((await fields(admin, "notactive", { number: "hide", feedback: "read" })).status, 204);
  const [a, b] = await Promise.all([
    prisma.notActiveRow.create({ data: { sheetId, dedupeKey: "a", data: { "الكود": "C-1", "المالك": "أ. حسن", "الرقم": "01000000555" }, status: "No Answer", feedback: "قديم" } }),
    prisma.notActiveRow.create({ data: { sheetId, dedupeKey: "b", data: { "الكود": "C-2", "المالك": "أ. علي", "الرقم": "01000000556" } } }),
  ]);
  const rows = async (cookie: string) => ((await call(`/not-active/sheets/${sheetId}/rows`, { cookie })).body as { items: { id: string; data: Record<string, string>; feedback: string | null }[] }).items;
  const mine = (await rows(person)).find((r) => r.id === a.id)!;
  assert.deepEqual([mine.data["الرقم"], mine.data["المالك"], mine.feedback], ["", "أ. حسن", "قديم"]);
  assert.equal((await rows(admin)).find((r) => r.id === a.id)!.data["الرقم"], "01000000555");
  // Not True keeps the stored feedback, not the one sent; a row without one can't be Not True for this person
  const set = await call(`/not-active/rows/${a.id}/status`, { method: "PUT", cookie: person, body: { status: "Not True", feedback: "جديد" } });
  assert.equal(set.status, 200);
  assert.deepEqual([(set.body as { data: Record<string, string> }).data["الرقم"], (set.body as { feedback: string }).feedback], ["", "قديم"]);
  assert.deepEqual(await prisma.notActiveRow.findUniqueOrThrow({ where: { id: a.id }, select: { status: true, feedback: true } }), { status: "Not True", feedback: "قديم" });
  assert.equal((await call(`/not-active/rows/${b.id}/status`, { method: "PUT", cookie: person, body: { status: "Not True", feedback: "جديد" } })).status, 400);
  assert.equal((await fields(admin, "notactive", { feedback: "hide" })).status, 204);
  assert.equal((await rows(person)).find((r) => r.id === a.id)!.feedback, null);
});

test("targets: a hidden target never leaves the API with the percent it gives; a read-only one is kept on save", async () => {
  const [first, second] = salesIds as [string, string];
  await prisma.salesTarget.create({ data: { employeeId: first, month: MONTH, value: "400000", deals: 1, visits: 5, pending: { value: "500000.00", deals: 1, visits: 5, by: "E2E" } } });
  assert.equal((await fields(admin, "reports", { value: "hide", commission: "hide" })).status, 204);
  const view = async (cookie: string) => (await call(`/reports/targets?month=${MONTH}`, { cookie })).body as { rows: Record<string, unknown>[]; teams: Record<string, unknown>[] };
  const r = (await view(person)).rows.find((x) => x.employeeId === first)!;
  assert.deepEqual([r.value, r.pending, r.percent, r.behind, r.achieved], ["", null, 0, false, "0.00"]);
  for (const t of (await view(person)).teams) assert.deepEqual([t.goal, t.commission, t.tierPercent, t.percent], ["", "", 0, 0]);
  assert.equal((await view(admin)).rows.find((x) => x.employeeId === first)!.value, "400000.00");
  // approving the waiting change would set the value: refused
  assert.equal((await call(`/reports/targets/${first}/${MONTH}/approve`, { method: "POST", cookie: person })).status, 403);
  // read only: shown, and a save keeps it while the Transactions and visits change
  assert.equal((await fields(admin, "reports", { value: "read" })).status, 204);
  assert.equal((await view(person)).rows.find((x) => x.employeeId === first)!.value, "400000.00");
  assert.equal((await call("/reports/targets", { method: "PUT", cookie: person, body: { employeeId: first, month: MONTH, value: "1.00", deals: 3, visits: 9 } })).status, 200);
  const kept = await prisma.salesTarget.findUniqueOrThrow({ where: { employeeId_month: { employeeId: first, month: MONTH } } });
  assert.deepEqual([kept.value.toFixed(2), kept.deals, kept.visits], ["400000.00", 3, 9]);
  // a month with no target yet: the salesperson's own target, not the one sent
  assert.equal((await call("/reports/targets", { method: "PUT", cookie: person, body: { employeeId: second, month: MONTH, value: "1.00", deals: 2, visits: 4 } })).status, 200);
  const own = await prisma.employee.findUniqueOrThrow({ where: { id: second }, select: { target: true } });
  const made = await prisma.salesTarget.findUniqueOrThrow({ where: { employeeId_month: { employeeId: second, month: MONTH } } });
  assert.deepEqual([made.value.toFixed(2), made.deals], [own.target.toFixed(2), 2]);
});
