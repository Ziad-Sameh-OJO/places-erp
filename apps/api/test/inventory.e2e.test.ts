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
  const units = await prisma.unit.findMany({ where: { project: { startsWith: P } }, select: { id: true, ownerId: true } });
  const ids = units.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { entity: "Unit", entityId: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  // the owners' files these units made (2.11), once nothing else is in them
  const owners = [...new Set(units.flatMap((u) => (u.ownerId ? [u.ownerId] : [])))];
  const empty = await prisma.client.findMany({ where: { id: { in: owners }, units: { none: {} }, leads: { none: {} } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entity: "Client", entityId: { in: empty.map((c) => c.id) } } });
  await prisma.client.deleteMany({ where: { id: { in: empty.map((c) => c.id) } } });
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

test("nothing is required (2.21), but a wrong value is refused in Arabic", async () => {
  const refused = async (body: object, word: string) => {
    const r = await call("/inventory/units", { method: "POST", cookie: manar, body });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(JSON.stringify(r.body), new RegExp(word), JSON.stringify(r.body));
  };
  await refused(rent({ pricePerSqm: "0" }), "Price per sqm");
  await refused(rent({ pricePerSqm: "-5" }), "بالسالب");
  await refused(rent({ space: -5 }), "المساحة");
  await refused(rent({ space: 12.5 }), "صحيح");
  await refused(rent({ condition: "مفروش" }), "التشطيب");
  await refused(rent({ ownerPhone: "12" }), "الرقم غلط");
  await refused(rent({ location: "مش لوكيشن" }), "اللوكيشن");
  await refused(rent({ divisible: true, minSplit: 95 }), "أصغر من مساحة الوحدة");
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

test("the form's options come from the settings' lists (12.7): the defaults, and active people as agents", async () => {
  const o = (await call("/inventory/units/options", { cookie: manar })).body;
  const values = (list: { value: string }[]) => list.map((i) => i.value);
  assert.ok(values(o.areas).includes("التجمع الخامس"));
  // «التشطيب» and «طرق الدفع» start with the values used today (the demo's), all active
  assert.deepEqual(o.conditions, [{ value: "متشطب", active: true }, { value: "نص تشطيب", active: true }, { value: "Core & Shell", active: true }]);
  assert.deepEqual(values(o.paymentMethods), ["كاش", "تقسيط 3 سنين", "تقسيط 5 سنين"]);
  assert.ok(o.agents.some((a: { id: string }) => a.id === agentId));
});

test("lists (12.7): a switched-off finishing can't be picked for a new unit, an old unit keeps it; nothing is deleted", async () => {
  const admin = await session("ahmed.islam@places.com");
  const saved = await prisma.setting.findMany({ where: { key: { in: ["finishings", "paymentPlans"] } } });
  const finishings = (await call("/settings", { cookie: manar })).body.finishings as { value: string; active: boolean }[];
  const u = await create(manar, rent({ project: `${P} Lists`, condition: "نص تشطيب", paymentMethod: undefined }));
  try {
    // only «master: edit» changes a list; sales can't
    const off = finishings.map((i) => (i.value === "نص تشطيب" ? { ...i, active: false } : i));
    assert.equal((await call("/settings/finishings", { method: "PUT", cookie: sales, body: { value: off } })).status, 403);
    assert.equal((await call("/settings/finishings", { method: "PUT", cookie: admin, body: { value: off } })).status, 200);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Setting", entityId: "finishings" }, orderBy: { at: "desc" } });
    assert.deepEqual((audit.after as { value: string; active: boolean }[]).find((i) => i.value === "نص تشطيب"), { value: "نص تشطيب", active: false });
    // the options still list it (filters need it), marked off; a new unit can't take it
    assert.deepEqual((await call("/inventory/units/options", { cookie: manar })).body.conditions.find((i: { value: string }) => i.value === "نص تشطيب"), { value: "نص تشطيب", active: false });
    const refused = await call("/inventory/units", { method: "POST", cookie: manar, body: rent({ project: `${P} Lists`, condition: "نص تشطيب" }) });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /التشطيب/);
    // the old unit keeps it through an edit, and the filter still finds it
    assert.equal((await call(`/inventory/units/${u.id}`, { method: "PUT", cookie: manar, body: rent({ project: `${P} Lists`, condition: "نص تشطيب", floor: "8" }) })).status, 200);
    assert.ok((await list(manar, "&condition=" + encodeURIComponent("نص تشطيب"))).items.some((x) => x.code === u.code));
    // a value is never removed (locked values are the domain's tests: no list has one today)
    const removed = await call("/settings/finishings", { method: "PUT", cookie: admin, body: { value: finishings.filter((i) => i.value !== "Core & Shell") } });
    assert.equal(removed.status, 400);
    assert.match(removed.body.error, /Core & Shell.*ماتتمسحش/);
    // a value twice, or an empty one
    assert.equal((await call("/settings/finishings", { method: "PUT", cookie: admin, body: { value: [...finishings, { value: "متشطب", active: true }] } })).status, 400);
    assert.equal((await call("/settings/finishings", { method: "PUT", cookie: admin, body: { value: [...finishings, { value: " ", active: true }] } })).status, 400);
    // back on: a new unit can take it again
    assert.equal((await call("/settings/finishings", { method: "PUT", cookie: admin, body: { value: finishings } })).status, 200);
    await create(manar, rent({ project: `${P} Lists`, condition: "نص تشطيب" }));
    // a payment method not on the list is refused for a new unit
    assert.equal((await call("/inventory/units", { method: "POST", cookie: randa, body: resale({ paymentMethod: "بيتكوين" }) })).status, 400);
  } finally {
    for (const r of saved) await prisma.setting.update({ where: { key: r.key }, data: { value: r.value as never } });
    await prisma.setting.deleteMany({ where: { key: { in: ["finishings", "paymentPlans"].filter((k) => !saved.some((r) => r.key === k)) } } });
  }
});

test("area tabs (2.5): Manar and Randa add / change / remove them, sales only read, every change audited", async () => {
  const before = (await call("/inventory/area-tabs", { cookie: sales })).body as Array<{ label: string }>;
  assert.ok(Array.isArray(before));
  assert.equal((await call("/inventory/area-tabs", { cookie: hr })).status, 403);
  assert.equal((await call("/inventory/area-tabs", { method: "POST", cookie: sales, body: { min: 9001, max: 9500 } })).status, 403);
  assert.equal((await call("/inventory/area-tabs", { method: "POST", cookie: rahma, body: { min: 9001, max: 9500 } })).status, 403);

  const made = await call("/inventory/area-tabs", { method: "POST", cookie: randa, body: { min: 9001, max: 9500 } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.label, "9001 to 9500");
  const id = made.body.id as string;
  try {
    // the new tab shows in the list (for sales too), in its place by «from»
    const labels = ((await call("/inventory/area-tabs", { cookie: sales })).body as Array<{ label: string }>).map((t) => t.label);
    assert.ok(labels.includes("9001 to 9500"));
    assert.equal(await prisma.auditLog.count({ where: { entity: "AreaTab", entityId: id, action: "create" } }), 1);
    // the same range twice, a range upside down, not a number
    assert.equal((await call("/inventory/area-tabs", { method: "POST", cookie: manar, body: { min: 9001, max: 9500 } })).status, 409);
    const upside = await call("/inventory/area-tabs", { method: "POST", cookie: manar, body: { min: 500, max: 100 } });
    assert.equal(upside.status, 400);
    assert.match(JSON.stringify(upside.body), /لحد/);
    assert.equal((await call("/inventory/area-tabs", { method: "POST", cookie: manar, body: { min: "x" } })).status, 400);
    assert.equal((await call("/inventory/area-tabs", { method: "POST", cookie: manar, body: { min: 0, max: 10 } })).status, 400);
    // change: sales no, Manar yes («and above» when «لحد» is empty)
    assert.equal((await call(`/inventory/area-tabs/${id}`, { method: "PATCH", cookie: sales, body: { min: 9001, max: null } })).status, 403);
    const open = await call(`/inventory/area-tabs/${id}`, { method: "PATCH", cookie: manar, body: { min: 9001, max: null } });
    assert.equal(open.status, 200, JSON.stringify(open.body));
    assert.equal(open.body.label, "+9000");
    assert.equal((await call("/inventory/area-tabs/nope", { method: "PATCH", cookie: manar, body: { min: 1, max: 2 } })).status, 404);
  } finally {
    assert.equal((await call(`/inventory/area-tabs/${id}`, { method: "DELETE", cookie: sales })).status, 403);
    assert.equal((await call(`/inventory/area-tabs/${id}`, { method: "DELETE", cookie: manar })).status, 204);
  }
  assert.equal((await call(`/inventory/area-tabs/${id}`, { method: "DELETE", cookie: manar })).status, 404);
  assert.deepEqual((await prisma.auditLog.findMany({ where: { entity: "AreaTab", entityId: id }, select: { action: true }, orderBy: { at: "asc" } })).map((a) => a.action), ["create", "update", "delete"]);
});

test("a unit is under the tab Manar picked, otherwise under its area's first tab; removing the tab sends it back", async () => {
  const T = `${P} Tabs2`;
  const a = await call("/inventory/area-tabs", { method: "POST", cookie: manar, body: { min: 1, max: 5 } }); // below the team's tabs (they start at 20)
  const b = await call("/inventory/area-tabs", { method: "POST", cookie: manar, body: { min: 1, max: 12 } }); // overlaps, wider
  const [narrow, wide] = [a.body.id as string, b.body.id as string];
  try {
    const byArea = await create(manar, rent({ project: T, space: 4 })); // fits both: the narrower first
    const picked = await create(manar, rent({ project: T, space: 4, areaTabId: wide }));
    const outside = await create(manar, rent({ project: T, space: 10 })); // only the wide one
    const inTab = async (tabId: string) => (await call(`/inventory/units?q=${encodeURIComponent(T)}&tabId=${tabId}`, { cookie: manar })).body.items.map((u: { code: string }) => u.code).sort();
    assert.deepEqual(await inTab(narrow), [byArea.code]);
    assert.deepEqual(await inTab(wide), [picked.code, outside.code].sort());
    const counts = (await call(`/inventory/area-tabs?q=${encodeURIComponent(T)}`, { cookie: manar })).body as Array<{ id: string; count: number }>;
    assert.equal(counts.find((t) => t.id === narrow)!.count, 1);
    assert.equal(counts.find((t) => t.id === wide)!.count, 2);
    assert.equal((await call(`/inventory/units/${picked.id}`, { cookie: manar })).body.areaTabId, wide);
    // a tab that isn't there
    assert.equal((await call("/inventory/units", { method: "POST", cookie: manar, body: rent({ project: T, areaTabId: "gone" }) })).status, 400);
    assert.deepEqual(await inTab("gone"), []);
    // removing the wide tab: the unit Manar put there goes back to «by its area» → the narrow tab
    assert.equal((await call(`/inventory/area-tabs/${wide}`, { method: "DELETE", cookie: manar })).status, 204);
    assert.deepEqual(await inTab(narrow), [byArea.code, picked.code].sort());
    assert.equal((await call(`/inventory/units/${picked.id}`, { cookie: manar })).body.areaTabId, null);
  } finally {
    await prisma.areaTab.deleteMany({ where: { id: { in: [narrow, wide] } } });
    await prisma.auditLog.deleteMany({ where: { entity: "AreaTab", entityId: { in: [narrow, wide] } } });
  }
});

test("hard cases: huge amounts refused (no 500), every refusal in Arabic, no future «last update», a departed agent stays", async () => {
  const arabic = (r: { body: { issues?: { message: string }[]; error?: string } }) => /[\u0600-\u06FF]/.test(r.body?.issues?.[0]?.message ?? r.body?.error ?? "");
  const post = (body: unknown) => call("/inventory/units", { method: "POST", cookie: manar, body });
  for (const body of [
    rent({ pricePerSqm: "1234567890123" }), rent({ space: 1_000_000, pricePerSqm: "99999999" }), rent({ pricePerSqm: "12345678901234567890" }),
    income({ space: 900_000, leasePerSqm: "99999999" }), rent({ parking: 1e9 }),
    {}, { ...rent(), type: undefined }, rent({ type: "Office" }), rent({ project: 5 }), rent({ floor: 3 }), rent({ agentId: 5 }), rent({ pricePerSqm: 1100 }),
    rent({ lastOwnerUpdateAt: "2099-01-01" }),
  ]) {
    const r = await post(body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
    assert.ok(arabic(r), JSON.stringify(r.body));
  }
  // the biggest total that fits is stored exactly
  const big = await create(manar, rent({ project: `${P} Big`, space: 100_000, pricePerSqm: "9999999.99" }));
  assert.equal((await call(`/inventory/units/${big.id}`, { cookie: manar })).body.totalPrice, "999999999000.00");
  assert.equal((await call("/inventory/units?minPrice=-5", { cookie: manar })).status, 400);

  // the agent who brought a unit stays on it after leaving; a new unit can't take them. A person made for this test
  // (invited, never active): switching a real account off would change the counts other test files compare meanwhile.
  const user = await prisma.user.create({ data: { email: `e2e-agent-${stamp}@places.test`, employee: { create: { name: `E2E وكيل ${stamp}`, jobTitle: "Sales", department: "Sales", salary: 0 } } }, include: { employee: true } });
  const departed = { project: `${P} Departed`, agentId: user.employee!.id };
  const u = await create(manar, rent(departed));
  await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
  try {
    assert.equal((await call(`/inventory/units/${u.id}`, { method: "PUT", cookie: manar, body: rent({ ...departed, floor: "7" }) })).status, 200);
    assert.equal((await post(rent(departed))).status, 400);
  } finally {
    await prisma.unit.deleteMany({ where: { agentId: user.employee!.id } });
    await prisma.employee.delete({ where: { id: user.employee!.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
