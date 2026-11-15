/**
 * 14.1–14.3 · the dashboards end-to-end: Ahmed Islam and Safwat open on their own company layout, a salesperson on
 * «مهامي النهارده» with the smaller dashboard of his role; the company dashboard and a person's performance are refused
 * to a salesperson; a lead that comes in today is counted (today, by stage) where the admin and its salesperson look.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import type { AhmedDashboard, CompanyDashboard, DashboardLayoutView, MyDashboard, PersonPerformance } from "@places/contracts";
import { call, mark, session } from "./helpers.ts";

const T = `DSH${Date.now().toString(36)}`;
const SALES = "anas@places.com";
let ahmed: string, safwat: string, sales: string, salesEmployeeId: string, leadId: string;

before(async () => {
  mark(T);
  [ahmed, safwat, sales] = await Promise.all(["ahmed.islam@places.com", "m.safwat@places.com", SALES].map((e) => session(e)));
  const emp = await prisma.employee.findFirstOrThrow({ where: { user: { email: SALES } }, select: { id: true } });
  salesEmployeeId = emp.id;
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "ahmed.islam@places.com" } });
  leadId = (await prisma.lead.create({ data: { code: `L-${T}`, name: `${T} عميل`, phones: [], area: "التجمع", type: "Rent", channel: "Facebook", stage: "INTERESTED", qualified: true, assignedToId: emp.id, assignedAt: new Date(), createdById: admin.id } })).id;
});

after(async () => {
  await prisma.lead.deleteMany({ where: { id: leadId } });
  await prisma.$disconnect();
});

const get = async <T>(path: string, cookie: string) => {
  const r = await call(path, { cookie });
  assert.equal(r.status, 200, `${path} → ${r.status}`);
  return r.body as T;
};

test("14.1 · Ahmed and Safwat open on their own dashboard; a salesperson stays on «مهامي النهارده»", async () => {
  assert.deepEqual(await get<DashboardLayoutView>("/dashboard/layout", ahmed), { layout: "ahmed", landing: "/dashboard" });
  assert.deepEqual(await get<DashboardLayoutView>("/dashboard/layout", safwat), { layout: "safwat", landing: "/dashboard" });
  assert.deepEqual(await get<DashboardLayoutView>("/dashboard/layout", sales), { layout: "role", landing: "/" });
});

test("14.1 · the company dashboard and a person's performance are refused to a salesperson", async () => {
  assert.equal((await call("/dashboard/company", { cookie: sales })).status, 403);
  assert.equal((await call(`/dashboard/people/${salesEmployeeId}`, { cookie: sales })).status, 403);
  assert.equal((await call("/dashboard/company")).status, 401);
});

test("14.2 · 14.3 · the company dashboard counts today's lead, by stage, with every section the admin may see", async () => {
  const d = await get<CompanyDashboard>("/dashboard/company", ahmed);
  assert.ok(d.today.leads >= 1 && d.today.interested >= 1);
  assert.deepEqual(d.stages.map((s) => s.stage), ["Interested", "Visit", "Meeting", "Near to Close", "Done Deal"]);
  assert.ok(d.stages[0]!.count >= 1);
  assert.match(d.quarter, /^\d{4}-Q[1-4]$/);
  assert.ok(d.inventory && d.finance && d.marketing && Array.isArray(d.today.late)); // the admin sees every module
  assert.equal(d.inventory.rent + d.inventory.sale, d.inventory.types.reduce((s, t) => s + t.count, 0));
  assert.ok(d.teams.length >= 4 && d.teams.every((t) => t.members.length > 0));
  assert.ok(d.sales.top.length <= 3);
});

test("14.2 · a click on a person: his week, month and quarter", async () => {
  const p = await get<PersonPerformance>(`/dashboard/people/${salesEmployeeId}`, safwat);
  assert.equal(p.employeeId, salesEmployeeId);
  assert.deepEqual(p.periods.map((x) => x.key), ["week", "month", "quarter"]);
  assert.equal(p.periods[0]!.target?.goal, ""); // a week has no target of its own
  assert.equal((await call("/dashboard/people/nobody", { cookie: ahmed })).status, 404);
});

test("14.1 · the role's dashboard: the salesperson's own lead and target", async () => {
  const d = await get<MyDashboard>("/dashboard/mine", sales);
  assert.ok(d.today.leads >= 1);
  assert.ok(d.stages.find((s) => s.stage === "Interested")!.count >= 1);
  assert.ok(d.targets); // a salesperson has his month and quarter
  const admin = await get<MyDashboard>("/dashboard/mine", ahmed);
  assert.equal(admin.targets, null); // not a salesperson
});

test("Ahmed's one page: a salesperson gets 403, a wrong period 400", async () => {
  assert.equal((await call("/dashboard/ahmed", { cookie: sales })).status, 403);
  assert.equal((await call("/dashboard/ahmed?period=year", { cookie: ahmed })).status, 400);
  assert.equal((await call("/dashboard/ahmed?period=quarter&year=2026", { cookie: ahmed })).status, 400); // year and quarter together
});

test("Ahmed's one page: today's lead in the strip and the funnel, the target line, the teams, «محتاج انتباهك»", async () => {
  const d = await get<AhmedDashboard>("/dashboard/ahmed", ahmed);
  assert.equal(d.period, "today");
  assert.equal(d.from, d.to);
  assert.ok(d.strip.leads.now >= 1 && typeof d.strip.leads.before === "number");
  assert.ok(d.strip.collected && /^\d+\.\d{2}$/.test(d.strip.collected.now));
  assert.deepEqual(d.funnel.map((s) => s.stage), ["Fresh", "Interested", "Visit", "Meeting", "Near to Close", "Done Deal"]);
  assert.ok(d.funnel[1]!.count >= 1);
  assert.equal(d.funnel.at(-1)!.next, null);
  assert.equal(typeof d.targets.quarter.expected, "string");
  assert.ok(d.teams.length >= 4);
  assert.ok(d.teams.every((t, i) => i === 0 || (d.teams[i - 1]!.percent ?? 0) >= (t.percent ?? 0))); // highest first
  assert.ok(d.teams.flatMap((t) => t.members).every((p) => p.percent !== null)); // 0%, never «—»
  assert.deepEqual(d.attention.map((a) => a.key).sort(), ["approval", "budget", "installments", "nearClose", "sla", "units"]);
  assert.equal(d.staleDays, 14);
  assert.ok(d.money && d.inventory && d.marketing);
  assert.deepEqual(d.inventory.types.map((t) => t.type), ["Resale", "Income", "Primary"]);
  assert.equal(d.inventory.sale, d.inventory.types.reduce((s, t) => s + t.count, 0));
});

test("Ahmed's one page: the period parameter (month, a picked quarter)", async () => {
  const m = await get<AhmedDashboard>("/dashboard/ahmed?period=month", ahmed);
  assert.equal(m.period, "month");
  assert.equal(m.from.slice(8), "01");
  const q = await get<AhmedDashboard>("/dashboard/ahmed?period=quarter&year=2026&quarter=1", ahmed);
  assert.deepEqual([q.from, q.to, q.quarter, q.year], ["2026-01-01", "2026-03-31", "2026-Q1", "2026"]); // ended: the whole quarter
  assert.equal(q.funnel.length, 6);
  assert.deepEqual([q.trend.unit, q.trend.points.length], ["week", 13]); // 90 days: 12 weeks and 6 days
  assert.ok(q.trend.points.every((p) => p.now !== null)); // ended: nothing still to come
  assert.deepEqual([q.collections?.unit, q.collections?.points.length], ["week", 13]);
  assert.equal(m.trend.unit, "day");
  assert.equal(m.trend.points[0]!.from, m.from);
});

test("Ahmed's one page: the charts add up to the strip's numbers", async () => {
  const d = await get<AhmedDashboard>("/dashboard/ahmed", ahmed);
  assert.equal(d.trend.unit, "hour");
  assert.equal(d.trend.points.length, 24);
  assert.ok(d.trend.points.every((p) => p.from === d.from && p.to === d.from && typeof p.before === "number"));
  assert.equal(d.trend.points.reduce((s, p) => s + (p.now ?? 0), 0), d.strip.leads.now);
  assert.equal(d.channels.reduce((s, c) => s + c.leads, 0), d.strip.leads.now);
  assert.ok(d.channels.find((c) => c.channel === "Facebook")!.leads >= 1); // this test's lead
  assert.ok(d.collections && d.collections.unit === "day" && d.collections.points.length === 7); // the office week
  assert.ok(d.collections.points.every((p) => /^\d+\.\d{2}$/.test(p.collected) && /^\d+\.\d{2}$/.test(p.expected)));
});
