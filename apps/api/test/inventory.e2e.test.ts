/**
 * 2.2 · the units API (M-03) against the real API and database: only Manar and Randa add and edit (Q18), sales only
 * read and never see a draft (Q15) or the owners' numbers, the code comes from the sequence, the total is computed,
 * every edit (prices too) is audited, and the toolbar's filters.
 * Manar = inventory, Randa = resale, Mohamed Mohsen = sales, Rahma = marketing, Basant = HR (no inventory).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
const P = `E2E ${stamp}`;
let manar: string, randa: string, sales: string, rahma: string, hr: string, agentId: string, rahmaId: string;

before(async () => {
  [manar, randa, sales, rahma, hr] = await Promise.all(
    ["manar.ahmed@places.com", "randa.mohamed@places.com", "m.mohsen@places.com", "rahma.hassan@places.com", "basant.elsawy@places.com"].map((e) => session(e)),
  );
  agentId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  rahmaId = (await prisma.user.findUniqueOrThrow({ where: { email: "rahma.hassan@places.com" } })).id;
});
after(async () => {
  const ids = (await prisma.unit.findMany({ where: { project: { startsWith: P } }, select: { id: true } })).map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  await prisma.notification.deleteMany({ where: { text: { contains: P } } });
  await prisma.$disconnect();
});

/** U-101 from the demo: 95 m at 1,100 a month in Mivida (M-03 3.1 Rent columns). */
const rent = (extra: object = {}) => ({
  type: "Rent", project: `${P} Mivida`, area: "التجمع الخامس", space: 95, condition: "متشطب", floor: "2", building: "B4", parking: 1,
  agentId, ownerName: "أ. سمير", ownerPhone: "0100 000 0101", pricePerSqm: "1100", maintenance: "15 / م", commission: "شهر", ...extra,
});
const resale = (extra: object = {}) => ({
  type: "Resale", project: `${P} Zayed Hub`, area: "الشيخ زايد", space: 85, condition: "متشطب", building: "Z3", agentId,
  ownerName: "أ. نبيل", ownerPhone: "01000000201", pricePerSqm: "36000", paymentMethod: "كاش", delivery: "فوري", ...extra,
});
/** U-301: 250 m, sale 36,000/m, lease 270/m → yield 9%. */
const income = (extra: object = {}) => ({
  type: "Income", project: `${P} October Medical`, area: "أكتوبر", space: 250, condition: "متشطب", building: "M1", agentId,
  ownerName: "أ. ماجد", pricePerSqm: "36000", leasePerSqm: "270", contractDuration: "5 سنين", startsOn: "2026-01-01", endsOn: "2030-12-31",
  escalationPct: 10, tenant: "صيدليات", serviceChargeUsd: "2", ...extra,
});

const create = async (cookie: string, body: object) => {
  const r = await call("/inventory/units", { method: "POST", cookie, body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body as { id: string; code: string };
};
const list = async (cookie: string, query = "") => {
  const r = await call(`/inventory/units?q=${encodeURIComponent(P)}&pageSize=100${query}`, { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { total: number; items: Array<Record<string, unknown> & { code: string }> };
};
const codes = async (cookie: string, query = "") => (await list(cookie, query)).items.map((u) => u.code).sort();
const confirm = (id: string) => prisma.unit.update({ where: { id }, data: { pdfStatus: "confirmed" } }); // Manar's confirm comes with 2.8

test("only Manar and Randa add and edit (Q18): sales and marketing read, HR has no inventory", async () => {
  assert.equal((await call("/inventory/units", { method: "POST", cookie: sales, body: rent() })).status, 403);
  assert.equal((await call("/inventory/units", { method: "POST", cookie: rahma, body: rent() })).status, 403);
  assert.equal((await call("/inventory/units", { cookie: hr })).status, 403);
  assert.equal((await call("/inventory/units/summary", { cookie: hr })).status, 403);
  assert.equal((await call("/inventory/units/options", { cookie: hr })).status, 403);

  const u = await create(randa, resale());
  assert.equal((await call(`/inventory/units/${u.id}`, { method: "PUT", cookie: sales, body: resale({ pricePerSqm: "1" }) })).status, 403);
  assert.equal((await call(`/inventory/units/${u.id}`, { method: "DELETE", cookie: sales })).status, 403);
  assert.equal((await call(`/inventory/units/${u.id}`, { method: "DELETE", cookie: randa })).status, 403); // archiving is Manar's
  assert.equal((await call(`/inventory/units/${u.id}`, { method: "PUT", cookie: randa, body: resale({ floor: "3" }) })).status, 200);
  assert.equal((await call(`/inventory/units/${u.id}`, { method: "PUT", cookie: manar, body: resale({ floor: "4" }) })).status, 200);
  // sales' failed edit changed nothing
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: u.id } })).pricePerSqm?.toFixed(2), "36000.00");
  assert.equal((await call("/inventory/units", { cookie: sales })).status, 200);
});

test("serial codes U-n from the sequence (M-03 3.2): one after the other, and never shared when saved at once", async () => {
  const a = await create(manar, rent());
  const b = await create(manar, rent());
  const n = (c: string) => Number(c.replace("U-", ""));
  assert.match(a.code, /^U-\d+$/);
  assert.ok(n(a.code) >= 101);
  assert.equal(n(b.code), n(a.code) + 1);
  const many = await Promise.all(Array.from({ length: 8 }, () => create(manar, rent())));
  assert.equal(new Set(many.map((u) => u.code)).size, 8);
});

test("the system fills in the total (price per m² × area) and Income's rent and yield; a sent total is ignored", async () => {
  const r = await create(manar, rent({ totalPrice: "1" }));
  const row = (await call(`/inventory/units/${r.id}`, { cookie: manar })).body;
  assert.equal(row.totalPrice, "104500.00");
  assert.equal(row.pricePerSqm, "1100.00");
  assert.equal(row.ownerPhone, "01000000101"); // spaces dropped
  assert.equal(row.income, null);

  const i = await create(manar, income());
  const inc = (await call(`/inventory/units/${i.id}`, { cookie: manar })).body;
  assert.equal(inc.totalPrice, "9000000.00");
  assert.deepEqual(inc.income, { monthlyRent: "67500.00", annualRent: "810000.00", yieldPct: 9 });
  assert.equal(inc.leasePerSqm, "270.00");
  assert.deepEqual(inc.details, { contractDuration: "5 سنين", startsOn: "2026-01-01", endsOn: "2030-12-31", escalationPct: 10, tenant: "صيدليات", serviceChargeUsd: "2.00" });
  assert.equal(inc.createdBy.name.length > 0, true);
  assert.equal(inc.pdfStatus, "draft");
});

test("each type's required columns (M-03 3.1), with Arabic messages", async () => {
  const refused = async (body: object, word: string) => {
    const r = await call("/inventory/units", { method: "POST", cookie: manar, body });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(JSON.stringify(r.body), new RegExp(word), JSON.stringify(r.body));
  };
  const noNumber: Record<string, unknown> = rent();
  delete noNumber.ownerPhone;
  await refused(noNumber, "الرقم");
  await refused(rent({ ownerName: "" }), "Contact");
  await refused(rent({ pricePerSqm: "" }), "المبلغ|Price");
  await refused(rent({ pricePerSqm: "0" }), "Price per sqm");
  await refused(rent({ pricePerSqm: "-5" }), "بالسالب");
  await refused(rent({ space: 0 }), "المساحة");
  await refused(rent({ space: 12.5 }), "صحيح");
  await refused(rent({ building: "" }), "رقم المبنى");
  await refused(rent({ agentId: "" }), "Agent");
  await refused(rent({ condition: "مفروش" }), "التشطيب");
  await refused(rent({ ownerPhone: "12" }), "الرقم غلط");
  await refused(rent({ location: "مش لوكيشن" }), "اللوكيشن");
  await refused(rent({ divisible: true, minSplit: 95 }), "أصغر من مساحة الوحدة");
  await refused(resale({ ownerName: "" }), "الأونر");
  const noLease: Record<string, unknown> = income();
  delete noLease.leasePerSqm;
  await refused(noLease, "Lease");
  await refused(income({ startsOn: "2027-01-01", endsOn: "2026-01-01" }), "End date");
  await refused(income({ escalationPct: 150 }), "Escalation");
  await refused({ ...rent(), type: "Office" }, "type|Invalid");
  // the agent must exist, a new area must be on the settings' list
  const bad = await call("/inventory/units", { method: "POST", cookie: manar, body: rent({ agentId: "nobody" }) });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Agent/);
  const area = await call("/inventory/units", { method: "POST", cookie: manar, body: rent({ area: "مش منطقة" }) });
  assert.equal(area.status, 400);
  assert.match(area.body.error, /Area/);
  // Primary: its own columns weren't sent yet, the common ones are enough
  await create(randa, { type: "Primary", project: `${P} Primary`, area: "العاصمة الإدارية", space: 120, condition: "Core & Shell", building: "T1", agentId });
});

test("sales never see a draft (Q15) or the owners (M-03 1.2); once confirmed they see the unit without them", async () => {
  const u = await create(manar, rent({ project: `${P} Draft` }));
  assert.ok((await codes(manar)).includes(u.code));
  assert.ok(!(await codes(sales)).includes(u.code));
  assert.equal((await call(`/inventory/units/${u.id}`, { cookie: sales })).status, 404);
  await confirm(u.id);
  assert.ok((await codes(sales)).includes(u.code));
  const seen = (await call(`/inventory/units/${u.id}`, { cookie: sales })).body;
  assert.equal(seen.ownerName, null);
  assert.equal(seen.ownerPhone, null);
  assert.equal(seen.totalPrice, "104500.00");
  // and searching an owner's name or number finds nothing for them
  assert.equal((await call(`/inventory/units?q=${encodeURIComponent("أ. سمير")}`, { cookie: sales })).body.items.filter((x: { code: string }) => x.code === u.code).length, 0);
  assert.equal((await call("/inventory/units?q=0100000010", { cookie: sales })).body.items.filter((x: { code: string }) => x.code === u.code).length, 0);
  assert.ok((await call("/inventory/units?q=01000000101&pageSize=100", { cookie: manar })).body.items.some((x: { code: string }) => x.code === u.code));
  // an edit sends it back to Manar's confirm (Q19), so sales lose it again
  assert.equal((await call(`/inventory/units/${u.id}`, { method: "PUT", cookie: manar, body: rent({ project: `${P} Draft`, floor: "9" }) })).status, 200);
  assert.ok(!(await codes(sales)).includes(u.code));
});

test("every edit is audited in its transaction with what changed — the price too (2.2)", async () => {
  const u = await create(manar, rent({ project: `${P} Audit` }));
  const created = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Unit", entityId: u.id, action: "create" } });
  assert.equal(created.module, "inventory");
  const r = await call(`/inventory/units/${u.id}`, { method: "PUT", cookie: randa, body: rent({ project: `${P} Audit`, pricePerSqm: "1200.50" }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.totalPrice, "114047.50"); // 95 × 1,200.50
  const edits = await prisma.auditLog.findMany({ where: { entity: "Unit", entityId: u.id, action: "update" } });
  assert.equal(edits.length, 1);
  assert.deepEqual(edits[0]!.before, { pricePerSqm: "1100.00", totalPrice: "104500.00" });
  assert.deepEqual(edits[0]!.after, { pricePerSqm: "1200.50", totalPrice: "114047.50" });
  // sending the same sheet again changes nothing: no audit line, the PDF isn't sent back
  await confirm(u.id);
  assert.equal((await call(`/inventory/units/${u.id}`, { method: "PUT", cookie: randa, body: rent({ project: `${P} Audit`, pricePerSqm: "1200.5" }) })).status, 200);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Unit", entityId: u.id, action: "update" } }), 1);
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: u.id } })).pdfStatus, "confirmed");
  // a missing unit
  assert.equal((await call("/inventory/units/nope", { method: "PUT", cookie: manar, body: rent() })).status, 404);
});

test("a new unit sends marketing the Live Alert (M-03 7.1)", async () => {
  const u = await create(manar, rent({ project: `${P} Alert` }));
  const n = await prisma.notification.findFirst({ where: { userId: rahmaId, text: { contains: u.code } } });
  assert.ok(n, "marketing got no alert");
  assert.match(n.text, /Live Alert/);
});

test("archive (Manar): gone from the list and the unit's page, audited", async () => {
  const u = await create(manar, rent({ project: `${P} Archive` }));
  assert.equal((await call(`/inventory/units/${u.id}`, { method: "DELETE", cookie: manar })).status, 204);
  assert.ok(!(await codes(manar)).includes(u.code));
  assert.equal((await call(`/inventory/units/${u.id}`, { cookie: manar })).status, 404);
  assert.equal((await call(`/inventory/units/${u.id}`, { method: "DELETE", cookie: manar })).status, 404);
  assert.equal(await prisma.auditLog.count({ where: { entity: "Unit", entityId: u.id, action: "archive" } }), 1);
});

test("filters: type (with the second type, Q17), area, space, price, status, late update, divisible", async () => {
  const F = `${P} Filters`;
  const small = await create(manar, rent({ project: F, space: 90, pricePerSqm: "650" })); // 58,500
  const big = await create(manar, rent({ project: F, space: 1800, pricePerSqm: "850", divisible: true, minSplit: 90, splitNote: "كل دور لوحده" }));
  const sale = await create(randa, resale({ project: F }));
  const old = await create(manar, rent({ project: F, space: 150, pricePerSqm: "900", lastOwnerUpdateAt: "2026-01-01" }));
  const rented = await create(manar, rent({ project: F, space: 210, pricePerSqm: "700" }));
  await prisma.unit.update({ where: { id: rented.id }, data: { status: "rented" } });
  await prisma.unit.update({ where: { id: old.id }, data: { alsoType: "Resale", alsoStatus: "available" } });
  const in_ = async (s: string) => (await call(`/inventory/units?q=${encodeURIComponent(F)}&pageSize=100${s}`, { cookie: manar })).body.items.map((u: { code: string }) => u.code).sort();
  const sorted = (...us: { code: string }[]) => us.map((u) => u.code).sort();

  assert.deepEqual(await in_(""), sorted(small, big, sale, old)); // available by default
  assert.deepEqual(await in_("&view=closed"), sorted(rented));
  assert.deepEqual(await in_("&type=Rent"), sorted(small, big, old));
  assert.deepEqual(await in_("&type=Resale"), sorted(sale, old)); // old is open as Resale too
  assert.deepEqual(await in_("&type=Income"), []);
  assert.deepEqual(await in_("&area=" + encodeURIComponent("الشيخ زايد")), sorted(sale));
  assert.deepEqual(await in_("&minSpace=100&maxSpace=200"), sorted(old));
  assert.deepEqual(await in_("&minSpace=1000"), sorted(big));
  assert.deepEqual(await in_("&maxPrice=60000"), sorted(small)); // totals: 58,500 · 1,530,000 · 3,060,000 · 135,000
  assert.deepEqual(await in_("&minPrice=100000&maxPrice=200000"), sorted(old));
  assert.deepEqual(await in_("&stale=true"), sorted(old));
  assert.deepEqual(await in_("&divisible=true"), sorted(big));
  assert.deepEqual(await in_("&agentId=" + agentId + "&type=Rent&minSpace=1000"), sorted(big));
  assert.deepEqual(await in_("&condition=" + encodeURIComponent("Core & Shell")), []);
  const byCode = (await call(`/inventory/units?q=${small.code.toLowerCase()}`, { cookie: manar })).body.items.map((u: { code: string }) => u.code);
  assert.deepEqual(byCode, [small.code]); // the code in any case

  const row = (await list(manar, "&divisible=true")).items.find((u) => u.code === big.code)!;
  assert.equal(row.minSplit, 90);
  assert.equal(row.stale, false);
  assert.equal((await list(manar, "&stale=true")).items.find((u) => u.code === old.code)!.stale, true);

  for (const bad of ["minSpace=200&maxSpace=100", "minPrice=5&maxPrice=1", "type=Office", "view=all", "stale=maybe", "minPrice=abc", "pageSize=1000"]) {
    assert.equal((await call(`/inventory/units?${bad}`, { cookie: manar })).status, 400, bad);
  }
});

test("tabs and tiles count what the person can see", async () => {
  const F = `${P} Tabs`;
  const a = await create(manar, rent({ project: F }));
  await create(manar, income({ project: F }));
  await confirm(a.id);
  const tabs = (await call(`/inventory/units/tabs?q=${encodeURIComponent(F)}`, { cookie: manar })).body;
  assert.deepEqual(tabs, { all: 2, Rent: 1, Resale: 0, Income: 1, Primary: 0, closed: 0 });
  // sales only count the confirmed one
  const salesTabs = (await call(`/inventory/units/tabs?q=${encodeURIComponent(F)}`, { cookie: sales })).body;
  assert.deepEqual(salesTabs, { all: 1, Rent: 1, Resale: 0, Income: 0, Primary: 0, closed: 0 });
  const tiles = (await call("/inventory/units/summary", { cookie: manar })).body;
  for (const k of ["available", "pdfDraft", "stale", "divisible"]) assert.equal(typeof tiles[k], "number", k);
  assert.ok(tiles.pdfDraft >= 1);
  assert.equal((await call("/inventory/units/summary", { cookie: sales })).body.pdfDraft, 0); // drafts aren't theirs to count
});

test("the form's options: areas from the settings, the conditions, active people as agents", async () => {
  const o = (await call("/inventory/units/options", { cookie: manar })).body;
  assert.ok(o.areas.includes("التجمع الخامس"));
  assert.deepEqual(o.conditions, ["متشطب", "نص تشطيب", "Core & Shell"]);
  assert.ok(o.agents.some((a: { id: string }) => a.id === agentId));
  assert.ok(o.paymentMethods.includes("كاش"));
});
