/**
 * 1.2 leads list (M-01) against the real API and database: the data scope is in the query, and the toolbar filters.
 * Team D: Abdallah Sleem (TL) and Mohamed Mohsen. Mahmoud Ali leads another team. Heba Salah is operations; Basant is HR.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";

const stamp = String(Date.now());
let mohsen: string, tl: string, ops: string, hr: string;
const code = (n: number) => `L-E2E${stamp}${n}`;

before(async () => {
  [mohsen, tl, ops, hr] = await Promise.all(["m.mohsen@places.com", "abdallah.sleem@places.com", "heba.salah@places.com", "basant.elsawy@places.com"].map((e) => session(e)));
  const emp = async (email: string) => (await prisma.employee.findFirstOrThrow({ where: { user: { email } } })).id;
  const mohsenId = await emp("m.mohsen@places.com");
  const teammate = (await prisma.employee.findFirstOrThrow({ where: { teamLeaderId: await emp("abdallah.sleem@places.com"), id: { not: mohsenId } } })).id;
  const otherTeam = (await prisma.employee.findFirstOrThrow({ where: { teamLeaderId: await emp("mahmoud.ali@places.com") } })).id;
  const lead = (n: number, assignedToId: string | null, extra: object = {}) => ({
    code: code(n), name: `E2E ${stamp} عميل ${n}`, phones: [`0100${stamp.slice(-7)}${n}`], area: "التجمع الخامس", type: "Rent",
    channel: "Facebook", assignedToId, createdById: "e2e", ...extra,
  });
  await prisma.lead.createMany({ data: [
    lead(1, mohsenId, { stage: "INTERESTED", qualified: true }),
    lead(2, teammate, { createdAt: new Date("2026-03-10T22:30:00Z") }), // 00:30 on 11 March in Cairo
    lead(3, otherTeam, { channel: "Instagram" }),
    lead(4, null),
  ] });
  savedRoutingState = (await prisma.setting.findUnique({ where: { key: "routing" } }))?.value;
});
after(async () => {
  await prisma.lead.deleteMany({ where: { code: { startsWith: `L-E2E${stamp}` } } });
  // creating leads with assignToId uses up the salesperson's turn (Q2): put the rotation back as it was
  if (savedRoutingState === undefined) await prisma.setting.deleteMany({ where: { key: "routing" } });
  else await prisma.setting.update({ where: { key: "routing" }, data: { value: savedRoutingState as never } });
  await prisma.$disconnect();
});
let savedRoutingState: unknown;

const codes = async (cookie: string, query = "") => {
  const r = await call(`/leads?q=${encodeURIComponent(`E2E ${stamp}`)}&pageSize=100${query}`, { cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.items.map((l: { code: string }) => l.code).sort();
};

test("data scope: sales see their own, the TL their team, operations everything; HR 403", async () => {
  assert.deepEqual(await codes(mohsen), [code(1)]);
  assert.deepEqual(await codes(tl), [code(1), code(2)]);
  assert.deepEqual(await codes(ops), [code(1), code(2), code(3), code(4)]);
  assert.equal((await call("/leads", { cookie: hr })).status, 403);
});

test("a row has what the list shows (stage name, salesperson name), not the whole record", async () => {
  const r = await call(`/leads?q=${code(1).toLowerCase()}`, { cookie: ops }); // the code in any case
  const row = r.body.items[0];
  assert.equal(r.body.total, 1);
  assert.equal(row.stage, "Interested");
  assert.equal(row.assignedTo.name, "محمد محسن");
  assert.equal(row.verification, undefined);
  assert.equal(row.createdById, undefined);
});

test("filters: stage, qualified=false, channel, search by mobile, unassigned salesperson", async () => {
  assert.deepEqual(await codes(ops, "&stage=Interested"), [code(1)]);
  assert.deepEqual(await codes(ops, "&qualified=false"), [code(2), code(3), code(4)]); // "false" means false
  assert.deepEqual(await codes(ops, "&qualified=true"), [code(1)]);
  assert.deepEqual(await codes(ops, "&channel=Instagram"), [code(3)]);
  const byPhone = await call(`/leads?q=0100-${stamp.slice(-7)}3`, { cookie: ops });
  assert.deepEqual(byPhone.body.items.map((l: { code: string }) => l.code), [code(3)]);
  // a salesperson searching someone else's mobile finds nothing: the scope is in the query
  assert.equal((await call(`/leads?q=0100${stamp.slice(-7)}3`, { cookie: mohsen })).body.total, 0);
});

test("dates are Cairo days with both ends included", async () => {
  assert.deepEqual(await codes(ops, "&from=2026-03-11&to=2026-03-11"), [code(2)]);
  assert.deepEqual(await codes(ops, "&to=2026-03-10"), []);
  assert.equal((await call("/leads?from=2026-03-12&to=2026-03-11", { cookie: ops })).status, 400);
  assert.equal((await call("/leads?qualified=maybe", { cookie: ops })).status, 400);
  // impossible days are refused, not a 500
  for (const d of ["2026-13-45", "2026-02-30"]) assert.equal((await call(`/leads?from=${d}`, { cookie: ops })).status, 400);
});

test("pagination: newest first, pages don't overlap", async () => {
  const p1 = (await call(`/leads?q=${encodeURIComponent(`E2E ${stamp}`)}&pageSize=2&page=1`, { cookie: ops })).body;
  const p2 = (await call(`/leads?q=${encodeURIComponent(`E2E ${stamp}`)}&pageSize=2&page=2`, { cookie: ops })).body;
  assert.equal(p1.total, 4);
  assert.equal(p2.items.length, 2);
  const all = [...p1.items, ...p2.items].map((l: { code: string }) => l.code);
  assert.equal(new Set(all).size, 4);
  assert.equal(all.at(-1), code(2)); // the oldest (March) comes last
});

/* ---------------- 1.3 lead details · Activity · comments ---------------- */

const idOf = async (n: number) => (await prisma.lead.findUniqueOrThrow({ where: { code: code(n) } })).id;
let nancy: string; // Office Manager: leads «view» only
let apiLeadId: string | undefined;
before(async () => { nancy = await session("nancy.islam@places.com"); });
after(async () => { if (apiLeadId) await prisma.lead.delete({ where: { id: apiLeadId } }).catch(() => {}); });

test("details: in scope 200 with the drawer's fields; out of scope 404 (not 403); no leads permission 403", async () => {
  const r = await call(`/leads/${await idOf(1)}`, { cookie: mohsen });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.code, code(1));
  assert.equal(r.body.stage, "Interested");
  assert.equal(r.body.assignedTo.name, "محمد محسن");
  assert.ok(Array.isArray(r.body.activities));
  assert.equal(r.body.createdById, undefined);

  assert.equal((await call(`/leads/${await idOf(2)}`, { cookie: tl })).status, 200);   // a teammate's lead
  assert.equal((await call(`/leads/${await idOf(3)}`, { cookie: mohsen })).status, 404); // another team's
  assert.equal((await call(`/leads/${await idOf(3)}`, { cookie: tl })).status, 404);
  assert.equal((await call(`/leads/${await idOf(3)}`, { cookie: ops })).status, 200);   // operations see all
  assert.equal((await call("/leads/no-such-lead", { cookie: ops })).status, 404);
  assert.equal((await call(`/leads/${await idOf(1)}`, { cookie: hr })).status, 403);
});

test("comment: goes on top of the Activity with who and when, stops the SLA clock once, and is audited", async () => {
  const id = await idOf(1);
  const r = await call(`/leads/${id}/comments`, { method: "POST", cookie: mohsen, body: { text: "  كلمته وهيبعت الميزانية  " } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const [top] = r.body.activities;
  assert.equal(top.kind, "comment");
  assert.equal(top.text, "كلمته وهيبعت الميزانية"); // trimmed
  assert.equal(top.by.name, "محمد محسن");
  assert.equal(r.body.touched, true);
  const firstAction = r.body.firstActionAt;
  assert.ok(firstAction);

  const again = await call(`/leads/${id}/comments`, { method: "POST", cookie: mohsen, body: { text: "متابعة" } });
  assert.equal(again.body.firstActionAt, firstAction); // the first action stays the first
  assert.equal(again.body.activities.length, r.body.activities.length + 1);

  const audit = await prisma.auditLog.findFirst({ where: { module: "leads", action: "comment", entityId: top.id } });
  assert.ok(audit);
});

test("comment: empty is 400, view-only is 403, someone else's lead is 404", async () => {
  assert.equal((await call(`/leads/${await idOf(1)}/comments`, { method: "POST", cookie: mohsen, body: { text: "   " } })).status, 400);
  assert.equal((await call(`/leads/${await idOf(1)}`, { cookie: nancy })).status, 200); // she can read it…
  assert.equal((await call(`/leads/${await idOf(1)}/comments`, { method: "POST", cookie: nancy, body: { text: "x" } })).status, 403); // …not write
  assert.equal((await call(`/leads/${await idOf(3)}/comments`, { method: "POST", cookie: mohsen, body: { text: "x" } })).status, 404);
});

test("a new lead's Activity starts with who entered it and who it went to (demo wording)", async () => {
  const mohsenId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  const created = await call("/leads", { method: "POST", cookie: ops, body: {
    name: "عميل تجربة التفاصيل", phones: [`015${stamp.slice(-8)}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
    assignToId: mohsenId, note: "عايز مكتب قريب من التسعين",
  } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  apiLeadId = created.body.id;
  const r = await call(`/leads/${apiLeadId}`, { cookie: mohsen });
  const texts = r.body.activities.map((a: { text: string }) => a.text);
  assert.ok(texts.includes("اتعمل بواسطة هبة صلاح · اتوزع لـ محمد محسن"), JSON.stringify(texts));
  assert.ok(texts.includes("عايز مكتب قريب من التسعين"));
  assert.equal(r.body.firstActionAt, null); // entering a lead isn't the salesperson's action
});

test("lead codes come from the sequence: L-1001…, never shared even when created at the same moment", async () => {
  const mohsenId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  const made = await Promise.all([1, 2, 3].map((i) => call("/leads", { method: "POST", cookie: ops, body: {
    name: `عميل كود ${i}`, phones: [`012${stamp.slice(-7)}${i}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook", assignToId: mohsenId,
  } })));
  try {
    for (const r of made) assert.equal(r.status, 201, JSON.stringify(r.body));
    const codes = made.map((r) => r.body.code);
    assert.ok(codes.every((c) => /^L-\d{4,}$/.test(c) && Number(c.slice(2)) >= 1001), codes.join());
    assert.equal(new Set(codes).size, 3);
  } finally {
    await prisma.lead.deleteMany({ where: { id: { in: made.map((r) => r.body?.id).filter(Boolean) } } });
  }
});

test("a stage change is an action too: it stops the SLA clock and goes on top of the Activity; the TL can comment on his team's lead", async () => {
  const id = await idOf(2); // the teammate's lead, untouched so far
  assert.equal((await call(`/leads/${id}`, { cookie: tl })).body.firstActionAt, null);
  assert.equal((await call(`/leads/${id}/stage`, { method: "PATCH", cookie: tl, body: { stage: "No Answer" } })).status, 200);
  const r = await call(`/leads/${id}`, { cookie: tl });
  assert.ok(r.body.firstActionAt);
  assert.equal(r.body.activities[0].kind, "stage");
  assert.equal(r.body.noAnswerCount, 1);
  assert.equal((await call(`/leads/${id}/comments`, { method: "POST", cookie: tl, body: { text: "x".repeat(2000) } })).status, 201);
  assert.equal((await call(`/leads/${id}/comments`, { method: "POST", cookie: tl, body: { text: "x".repeat(2001) } })).status, 400);
});

/* ---------------- 1.4 Telesales: «يفضل عندي» or «التوزيع» ---------------- */

const AREA = `E2E منطقة ${stamp}`;
let hadeer: string, savedRouting: unknown;
const teleLeads: string[] = [];
before(async () => {
  hadeer = await session("hadeer.tarek@places.com");
  const mohsenId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  // a test area covered by Mohsen only, so «التوزيع» has someone to go to (1.12 will manage these from a screen)
  const row = await prisma.setting.findUnique({ where: { key: "areaRouting" } });
  savedRouting = row?.value;
  const pools = { ...((row?.value ?? {}) as Record<string, string[]>), [AREA]: [mohsenId] };
  await prisma.setting.upsert({ where: { key: "areaRouting" }, update: { value: pools }, create: { key: "areaRouting", value: pools } });
});
after(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: teleLeads } } });
  if (savedRouting === undefined) await prisma.setting.deleteMany({ where: { key: "areaRouting" } });
  else await prisma.setting.update({ where: { key: "areaRouting" }, data: { value: savedRouting as never } });
});

const teleLead = async (cookie: string, n: number, extra: object) => {
  const r = await call("/leads", { method: "POST", cookie, body: {
    name: `E2E-T ${stamp} ${n}`, phones: [`010${stamp.slice(-7)}${n}`], area: AREA, type: "Rent", channel: "Telesales", ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  teleLeads.push(r.body.id);
  return r.body.id as string;
};
const listCodes = async (cookie: string) =>
  (await call(`/leads?q=${encodeURIComponent(`E2E-T ${stamp}`)}&pageSize=100`, { cookie })).body.items.map((l: { name: string }) => l.name).sort();

test("Telesales «يفضل عندي»: stays with her, marked «مع Telesales», no SLA clock; the salesperson doesn't see it", async () => {
  const id = await teleLead(hadeer, 1, { keep: true });
  const r = await call(`/leads/${id}`, { cookie: hadeer });
  assert.equal(r.status, 200);
  assert.equal(r.body.assignedTo.name, "هدير طارق");
  assert.equal(r.body.ownedByTelesales, true);
  assert.equal(r.body.activities.at(-1).text, "اتعمل بواسطة هدير طارق · فضل عند Telesales");
  assert.deepEqual(await listCodes(hadeer), [`E2E-T ${stamp} 1`]);
  assert.equal((await call(`/leads/${id}`, { cookie: mohsen })).status, 404);
  // the SLA job reads the lead's own fields: with Telesales → leadSla() is null (domain test)
  const row = await prisma.lead.findUniqueOrThrow({ where: { id } });
  assert.equal(row.ownedByTelesales, true);
});

test("Telesales «التوزيع» (and the default): goes to the area's salesperson and leaves her list — 404 for her", async () => {
  const routed = await teleLead(hadeer, 2, { keep: false });
  const byDefault = await teleLead(hadeer, 3, {});
  for (const id of [routed, byDefault]) {
    const r = await call(`/leads/${id}`, { cookie: mohsen });
    assert.equal(r.status, 200, "the salesperson it went to sees it");
    assert.equal(r.body.ownedByTelesales, false);
    assert.equal(r.body.activities.at(-1).text, "اتعمل بواسطة هدير طارق · اتوزع لـ محمد محسن");
    assert.equal((await call(`/leads/${id}`, { cookie: hadeer })).status, 404);
    assert.equal((await call(`/leads/${id}/comments`, { method: "POST", cookie: hadeer, body: { text: "x" } })).status, 404);
  }
  assert.deepEqual(await listCodes(hadeer), [`E2E-T ${stamp} 1`]); // only the one she kept
});

test("«keep» is Telesales' choice only: a salesperson's own lead stays his, not marked «مع Telesales»", async () => {
  const id = await teleLead(mohsen, 4, { keep: true });
  const r = await call(`/leads/${id}`, { cookie: mohsen });
  assert.equal(r.body.assignedTo.name, "محمد محسن");
  assert.equal(r.body.ownedByTelesales, false);
  assert.equal(r.body.activities.at(-1).text, "اتعمل بواسطة محمد محسن · فضل عنده (هو اللي دخّله)");
});

/* ---------------- 1.5 duplicates: every arrival counts, Operations decides (M-01 Q7, M-04 Q22) ---------------- */

const dupLeads: string[] = [];
after(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: dupLeads } } }); // arrivals and duplicates go with it (cascade)
  await prisma.notification.deleteMany({ where: { text: { contains: `E2E-D ${stamp}` } } });
});
const P1 = `011${stamp.slice(-7)}5`, P2 = `011${stamp.slice(-7)}6`;
let dupLeadId: string, dupCode: string, dupId: string;

test("a mobile we already have: no new lead, the arrival counts for its channel, the old lead says who tried, Operations is notified", async () => {
  const first = await call("/leads", { method: "POST", cookie: mohsen, body: {
    name: `E2E-D ${stamp} الأول`, phones: [P1], area: "التجمع الخامس", type: "Rent", channel: "Facebook", budget: "50000" } });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  [dupLeadId, dupCode] = [first.body.id, first.body.code];
  dupLeads.push(dupLeadId);

  const again = await call("/leads", { method: "POST", cookie: hadeer, body: {
    name: `E2E-D ${stamp} التاني`, phones: [P2, P1], area: "التجمع الخامس", type: "Resale", space: 120, channel: "Google Ads", budget: "50000.00", keep: true } });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, `العميل ده موجود (${dupCode}) · اتبعت للأوبريشن تقرر`);

  assert.equal(await prisma.lead.count({ where: { phones: { has: P1 } } }), 1); // no second lead
  const arrivals = await prisma.leadArrival.findMany({ where: { leadId: dupLeadId }, orderBy: { at: "asc" } });
  assert.deepEqual(arrivals.map((a) => [a.channel, a.duplicate]), [["Facebook", false], ["Google Ads", true]]);

  const d = await call(`/leads/${dupLeadId}`, { cookie: mohsen });
  assert.equal(d.body.activities[0].text, `هدير طارق حاول يدخّل العميل ده تاني (${P2} / ${P1}) · مستني قرار الأوبريشن`);
  assert.equal(d.body.firstActionAt, null); // someone else's attempt isn't the salesperson's action

  const heba = await prisma.user.findUniqueOrThrow({ where: { email: "heba.salah@places.com" } });
  assert.ok(await prisma.notification.findFirst({ where: { userId: heba.id, text: `عميل مكرر: E2E-D ${stamp} التاني موجود في ${dupCode} · قرّري أنهي بيانات تفضل` } }));
});

test("the queue is Operations' only: both sides side by side; sales and HR get 403", async () => {
  assert.equal((await call("/leads/duplicates", { cookie: mohsen })).status, 403);
  assert.equal((await call("/leads/duplicates", { cookie: hadeer })).status, 403);
  assert.equal((await call("/leads/duplicates", { cookie: hr })).status, 403);
  const r = await call("/leads/duplicates", { cookie: ops });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = r.body.find((x: { lead: { id: string } }) => x.lead.id === dupLeadId);
  assert.ok(row);
  dupId = row.id;
  assert.equal(row.by.name, "هدير طارق");
  assert.equal(row.lead.code, dupCode);
  assert.equal(row.lead.assignedTo.name, "محمد محسن");
  assert.deepEqual([row.lead.name, row.lead.channel, row.lead.type, row.lead.budget], [`E2E-D ${stamp} الأول`, "Facebook", "Rent", "50000.00"]);
  assert.deepEqual([row.entry.name, row.entry.channel, row.entry.type, row.entry.space, row.entry.budget], [`E2E-D ${stamp} التاني`, "Google Ads", "Resale", 120, "50000.00"]);
  assert.equal((await call(`/leads/duplicates/${dupId}/decide`, { method: "POST", cookie: mohsen, body: {} })).status, 403);
});

test("Operations decides: chosen fields and the channel move, both mobiles stay, audited before/after; deciding twice is 409", async () => {
  const r = await call(`/leads/duplicates/${dupId}/decide`, { method: "POST", cookie: ops, body: { name: "new", channel: "new", budget: "new" } });
  assert.equal(r.status, 204, JSON.stringify(r.body));
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: dupLeadId } });
  assert.equal(lead.name, `E2E-D ${stamp} التاني`);
  assert.equal(lead.channel, "Google Ads");
  assert.equal(lead.type, "Rent"); // not chosen: the old one stays
  assert.equal(lead.budget?.toFixed(2), "50000.00"); // «50000» and «50000.00» are the same: nothing taken
  assert.deepEqual(lead.phones, [P1, P2]);

  const d = await call(`/leads/${dupLeadId}`, { cookie: mohsen });
  assert.equal(d.body.activities[0].text, "الأوبريشن قررت في التكرار: اتاخد من الجديد الاسم، الـ channel");
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: dupLeadId, action: "duplicate-decision" } });
  assert.deepEqual((audit.before as { name: string }).name, `E2E-D ${stamp} الأول`);
  assert.equal((audit.after as { channel: string }).channel, "Google Ads");

  assert.equal((await call(`/leads/duplicates/${dupId}/decide`, { method: "POST", cookie: ops, body: {} })).status, 409);
  assert.ok(!(await call("/leads/duplicates", { cookie: ops })).body.some((x: { id: string }) => x.id === dupId));
  assert.equal((await call("/leads/duplicates/nope/decide", { method: "POST", cookie: ops, body: {} })).status, 404);
  assert.equal((await call(`/leads/duplicates/${dupId}/decide`, { method: "POST", cookie: ops, body: { name: "maybe" } })).status, 400);
});

/* ---------------- 1.6 the list's SLA column, the KPI tiles, the filters' choices ---------------- */

const slaCodes: string[] = [];
after(async () => { await prisma.lead.deleteMany({ where: { code: { in: slaCodes } } }); });

test("list rows carry the SLA: a Fresh untouched lead assigned a month ago is pulled (100%); touched, with Telesales or unassigned → none", async () => {
  const mohsenId = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600e3);
  const mk = (n: number, extra: object) => {
    const c = `L-E2ES${stamp}${n}`; slaCodes.push(c);
    return { code: c, name: `E2E-S ${stamp} ${n}`, phones: [`0102${stamp.slice(-7)}${n}`], area: "التجمع الخامس", type: "Rent", channel: "Facebook",
      assignedToId: mohsenId, assignedAt: monthAgo, createdById: "e2e", ...extra };
  };
  await prisma.lead.createMany({ data: [mk(1, {}), mk(2, { touched: true }), mk(3, { ownedByTelesales: true }), mk(4, { assignedAt: null })] });
  const r = await call(`/leads?q=${encodeURIComponent(`E2E-S ${stamp}`)}&pageSize=10`, { cookie: ops });
  const sla = Object.fromEntries(r.body.items.map((l: { name: string; sla: unknown }) => [l.name.slice(-1), l.sla]));
  assert.deepEqual(sla["1"], { level: "pull", minutesLeft: 0, pct: 100 });
  assert.deepEqual([sla["2"], sla["3"], sla["4"]], [null, null, null]);
  assert.equal((await call(`/leads/${(await prisma.lead.findUniqueOrThrow({ where: { code: slaCodes[0]! } })).id}`, { cookie: mohsen })).body.sla.level, "pull");
});

test("summary: the tiles agree with the list for the same person; HR 403", async () => {
  for (const cookie of [mohsen, tl, ops]) {
    const s = (await call("/leads/summary", { cookie })).body;
    const total = async (q: string) => (await call(`/leads?pageSize=1${q}`, { cookie })).body.total;
    assert.equal(s.total, await total(""));
    assert.equal(s.fresh, await total("&stage=Fresh"));
    assert.equal(s.qualified, await total("&qualified=true"));
    assert.equal(s.noAnswer, await total("&stage=No%20Answer"));
    assert.equal(s.interested, await total("&stage=Interested"));
    assert.equal(typeof s.holidayMode, "boolean");
    assert.ok(s.slaRules.pullAfter > s.slaRules.warnAfter);
  }
  assert.equal((await call("/leads/summary", { cookie: hr })).status, 403);
});

test("filter choices: sales get no salespeople, a TL his team only, operations everyone; HR 403", async () => {
  const names = async (cookie: string) => (await call("/leads/options", { cookie })).body.salespeople.map((p: { name: string }) => p.name);
  assert.deepEqual(await names(mohsen), []);
  const team = await names(tl);
  assert.ok(team.includes("محمد محسن"));
  const otherTeamMember = (await prisma.employee.findFirstOrThrow({ where: { teamLeader: { user: { email: "mahmoud.ali@places.com" } } } })).name;
  assert.ok(!team.includes(otherTeamMember));
  const all = await names(ops);
  assert.ok(all.includes("محمد محسن") && all.includes(otherTeamMember) && all.includes("هدير طارق"));
  assert.ok(!all.includes("بسنت الصاوي")); // HR doesn't hold leads
  assert.ok(Array.isArray((await call("/leads/options", { cookie: ops })).body.campaigns));
  assert.equal((await call("/leads/options", { cookie: hr })).status, 403);
});

test("board: every stage once, each lane's total is the list's count for that stage, at most 30 cards, same scope", async () => {
  for (const cookie of [mohsen, ops]) {
    const b = (await call("/leads/board", { cookie })).body;
    assert.equal(b.lanes.length, 13);
    for (const lane of b.lanes) {
      const listTotal = (await call(`/leads?pageSize=1&stage=${encodeURIComponent(lane.stage)}`, { cookie })).body.total;
      assert.equal(lane.total, listTotal, lane.stage);
      assert.ok(lane.items.length <= 30 && lane.items.length === Math.min(30, lane.total), lane.stage);
      assert.ok(lane.items.every((l: { stage: string }) => l.stage === lane.stage));
    }
  }
  const filtered = (await call(`/leads/board?q=${encodeURIComponent(`E2E ${stamp}`)}`, { cookie: ops })).body;
  assert.equal(filtered.lanes.reduce((n: number, l: { total: number }) => n + l.total, 0), (await call(`/leads?pageSize=1&q=${encodeURIComponent(`E2E ${stamp}`)}`, { cookie: ops })).body.total);
  assert.equal((await call("/leads/board", { cookie: hr })).status, 403);
});
