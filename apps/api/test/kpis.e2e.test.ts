/**
 * M-12 · KPI cards (11.1–11.4 · 11.11 · 11.14) against the real API and the seeded Q4 2026 cards: a salesperson sees his
 * own card only, his Team Leader his team, Nancy (Office Manager) the money and the quarter, Heba as the KPI watcher
 * everything without money. Everything the file changes is put back in `after`, so it runs again on the same database.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { API, call, kpiQuarterLock, lastMail, session } from "./helpers.ts";
import { kpiMidQuarterTick } from "../../worker/src/processors/kpi-mid-quarter.ts";

const start = new Date();
const LINK = `https://e2e.test/${Date.now()}`;
let admin: string, nancy: string, heba: string, mahmoud: string, youssef: string, mokhtar: string, hadeer: string;
let watchBefore: unknown, salaryBefore: string | null = null, fieldsBefore: string[] | null = null;
const ids = { mahmoud: "", nancyUser: "", nancyEmp: "", hebaUser: "", testCard: "", youssefEmp: "", youssefUser: "", basantUser: "" };
const touched: string[] = []; // seeded cards whose value / plan / approval the file changes
const invTemp = { emp: "", user: "" }; // 11.19: someone on the inventory team with no card

before(async () => {
  [admin, nancy, heba, mahmoud, youssef, mokhtar, hadeer] = await Promise.all([
    "ahmed.islam@places.com", "nancy.islam@places.com", "heba.salah@places.com", "mahmoud.ali@places.com", "youssef.safwat@places.com",
    "mokhtar.gamal@places.com", "hadeer.tarek@places.com"].map((e) => session(e)));
  const emp = async (email: string) => prisma.employee.findFirstOrThrow({ where: { user: { email } }, select: { id: true, userId: true } });
  const [m, n, h, y, b] = await Promise.all(["mahmoud.ali@places.com", "nancy.islam@places.com", "heba.salah@places.com", "youssef.safwat@places.com", "basant.elsawy@places.com"].map(emp));
  Object.assign(ids, { mahmoud: m!.id, nancyUser: n!.userId, nancyEmp: n!.id, hebaUser: h!.userId, youssefEmp: y!.id, youssefUser: y!.userId, basantUser: b!.userId });
  watchBefore = (await prisma.setting.findUnique({ where: { key: "kpiWatch" } }))?.value ?? null;
});

/** The quarter: back to Q4 2026 open, without the copies the new quarter made (the TLs' seeded Q1 cards stay). */
async function reopenQ4() {
  await prisma.kpiCard.deleteMany({ where: { quarter: "2027-Q1", items: { none: { title: "تحقيق تارجت الفريق" } } } });
  await prisma.kpiQuarter.deleteMany({ where: { id: "2027-Q1" } });
  await prisma.kpiQuarter.update({ where: { id: "2026-Q4" }, data: { status: "open", closedAt: null, closedById: null, sheetsAt: null, sheetsById: null } });
  await prisma.kpiCard.updateMany({ where: { quarter: "2026-Q4" }, data: { finalScore: null, finalAmount: null, midAlertAt: null } });
}

after(async () => {
  await reopenQ4();
  await prisma.kpiCard.deleteMany({ where: { quarter: "2026-Q3" } }); // the past quarter the 11.6 test makes
  if (salaryBefore != null) await prisma.employee.update({ where: { id: ids.youssefEmp }, data: { salary: salaryBefore } });
  if (ids.testCard) await prisma.kpiCard.deleteMany({ where: { id: ids.testCard } });
  await prisma.kpiCard.updateMany({ where: { id: { in: touched } }, data: { plan: null, approvedBy: null, approvedAt: null } });
  await prisma.kpiItem.updateMany({ where: { cardId: { in: touched }, method: "manual" }, data: { value: null } });
  await prisma.kpiDelivery.deleteMany({ where: { link: LINK } });
  if (watchBefore == null) await prisma.setting.deleteMany({ where: { key: "kpiWatch" } });
  else await prisma.setting.update({ where: { key: "kpiWatch" }, data: { value: watchBefore as never } });
  await prisma.kpiBonusRule.deleteMany({ where: { createdAt: { gte: start } } });
  if (fieldsBefore) await prisma.kpiBands.update({ where: { id: "default" }, data: { sheetFields: fieldsBefore } });
  if (invTemp.emp) { await prisma.kpiCard.deleteMany({ where: { employeeId: invTemp.emp } }); await prisma.employee.delete({ where: { id: invTemp.emp } }); }
  if (invTemp.user) await prisma.user.delete({ where: { id: invTemp.user } });
  await prisma.auditLog.deleteMany({ where: { module: "kpis", at: { gte: start } } });
  // the quarter's results and sheets were mailed to everyone too (with or without an in-app copy)
  await prisma.mailLog.deleteMany({ where: { createdAt: { gte: start }, OR: [
    { notification: { link: "/kpis", createdAt: { gte: start } } }, { subject: { startsWith: "ورقة Q" } }, { subject: { startsWith: "نتيجة الربع" } }, { subject: { startsWith: "KPI تحت الـ Threshold" } },
  ] } });
  await prisma.notification.deleteMany({ where: { link: "/kpis", createdAt: { gte: start } } });
  await prisma.$disconnect();
});

const board = async (cookie: string, scope: string) => call(`/kpis/board?scope=${scope}`, { cookie });

test("11.1 · the seed: 14 cards from the file + 18 salespeople, weights 100%, Q4 2026 open", async () => {
  const all = await board(admin, "all");
  assert.equal(all.status, 200, JSON.stringify(all.body));
  assert.equal(all.body.quarter.label, "Q4 2026");
  assert.ok(all.body.cards.length >= 32);
  const sums = await prisma.kpiItem.groupBy({ by: ["cardId"], _sum: { weight: true }, where: { card: { quarter: "2026-Q4" } } });
  assert.ok(sums.every((s) => s._sum.weight === 100));
});

test("11.2 · my card: a salesperson sees his own card with its money, never a colleague's or the company", async () => {
  const me = await board(youssef, "me");
  assert.equal(me.body.cards.length, 1);
  assert.equal(me.body.cards[0].follower, "محمود علي");
  const card = await call(`/kpis/cards/${me.body.cards[0].id}`, { cookie: youssef });
  assert.equal(card.status, 200);
  assert.equal(card.body.items.length, 7);
  assert.ok(card.body.pay, "his own money");
  assert.match(card.body.items[4].calc, /Farming/);
  assert.equal(card.body.can.manage, false);
  assert.equal((await board(youssef, "all")).status, 403);
  assert.equal((await call("/kpis/company", { cookie: youssef })).status, 403);
  const colleague = (await board(mahmoud, "team")).body.cards.find((c: { name: string }) => c.name !== "يوسف صفوت");
  assert.equal((await call(`/kpis/cards/${colleague.id}`, { cookie: youssef })).status, 404);
  assert.equal((await call(`/kpis/cards/${me.body.cards[0].id}/items`, { method: "PUT", cookie: youssef, body: { items: [{ title: "x", weight: 100, method: "manual", goal: 1 }] } })).status, 403);
  assert.equal((await call(`/kpis/cards/${me.body.cards[0].id}/pay`, { method: "PATCH", cookie: youssef, body: { base: "bonus", period: "quarter", amount: "1.00" } })).status, 403);
});

test("11.2 · «سلّمت»: the owner hands in with a link, up to the times due; nobody else can", async () => {
  const card = (await board(mokhtar, "me")).body.cards[0];
  const view = (await call(`/kpis/cards/${card.id}`, { cookie: mokhtar })).body;
  const item = view.items.find((it: { method: string }) => it.method === "report");
  assert.equal(item.canDeliver, true);
  const path = `/kpis/cards/${card.id}/items/${item.id}/deliveries`;
  assert.equal((await call(path, { method: "POST", cookie: nancy, body: { link: LINK } })).status, 403);
  assert.equal((await call(path, { method: "POST", cookie: mokhtar, body: {} })).status, 400);
  for (let i = item.delivered; i < item.required; i++) assert.equal((await call(path, { method: "POST", cookie: mokhtar, body: { link: LINK } })).status, 204);
  assert.equal((await call(path, { method: "POST", cookie: mokhtar, body: { link: LINK } })).status, 409);
  const done = (await call(`/kpis/cards/${card.id}`, { cookie: mokhtar })).body.items.find((it: { id: string }) => it.id === item.id);
  assert.equal(done.achievement, 100);
});

test("11.3 · my team: the follower types the manual items, writes the plan and approves; the owner can't", async () => {
  const team = await board(mahmoud, "team");
  assert.equal(team.body.cards.length, 5); // team A
  const card = (await board(nancy, "team")).body.cards.find((c: { name: string }) => c.name === "مختار جمال");
  touched.push(card.id);
  const view = (await call(`/kpis/cards/${card.id}`, { cookie: nancy })).body;
  const manual = view.items.find((it: { method: string }) => it.method === "manual");
  assert.equal(manual.canEnter, true);
  assert.equal((await call(`/kpis/cards/${card.id}/items/${manual.id}/value`, { method: "PATCH", cookie: mokhtar, body: { value: 100 } })).status, 403);
  assert.equal((await call(`/kpis/cards/${card.id}/items/${manual.id}/value`, { method: "PATCH", cookie: nancy, body: { value: 92 } })).status, 204);
  assert.equal((await call(`/kpis/cards/${card.id}/plan`, { method: "PATCH", cookie: mokhtar, body: { plan: "x" } })).status, 403);
  assert.equal((await call(`/kpis/cards/${card.id}/plan`, { method: "PATCH", cookie: nancy, body: { plan: "متابعة أسبوعية" } })).status, 204);
  assert.equal((await call(`/kpis/cards/${card.id}/approve`, { method: "POST", cookie: mokhtar })).status, 403);
  assert.equal((await call(`/kpis/cards/${card.id}/approve`, { method: "POST", cookie: nancy })).status, 204);
  assert.equal((await call(`/kpis/cards/${card.id}/approve`, { method: "POST", cookie: nancy })).status, 409);
  const again = (await call(`/kpis/cards/${card.id}`, { cookie: nancy })).body;
  assert.equal(again.items.find((it: { id: string }) => it.id === manual.id).value, 92);
  assert.equal(again.approved.by, "نانسي إسلام");
  // Heba's card: two items Nancy rates although Heba's follower is Nancy too; the owner (Heba) can't
  const hebaCard = (await board(nancy, "team")).body.cards.find((c: { name: string }) => c.name === "هبة صلاح");
  touched.push(hebaCard.id);
  const rated = (await call(`/kpis/cards/${hebaCard.id}`, { cookie: heba })).body.items.filter((it: { method: string }) => it.method === "manual");
  assert.ok(rated.every((it: { canEnter: boolean; enteredBy: string[] }) => !it.canEnter && it.enteredBy.includes(ids.nancyUser)));
});

test("11.4 · 11.11 · a card for someone without one, the editor, the follower and the money", async () => {
  const company = await call("/kpis/company", { cookie: admin });
  assert.ok(company.body.noCard.some((p: { id: string }) => p.id === ids.mahmoud));
  const source = (await board(youssef, "me")).body.cards[0].id;
  const made = await call("/kpis/cards", { method: "POST", cookie: admin, body: { employeeId: ids.mahmoud, copyFrom: source } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  ids.testCard = made.body.id;
  assert.equal((await call("/kpis/cards", { method: "POST", cookie: admin, body: { employeeId: ids.mahmoud } })).status, 409);
  assert.equal((await call("/kpis/cards", { method: "POST", cookie: hadeer, body: { employeeId: ids.mahmoud } })).status, 403);

  const card = (await call(`/kpis/cards/${ids.testCard}`, { cookie: admin })).body;
  assert.equal(card.items.length, 7);
  const first = card.items[0];
  const items = (w1: number, metric: string | null = "calls") => ({ items: [
    { id: first.id, title: first.title, weight: w1, method: "system", metric, params: metric === "calls" ? { per: "week", avg: "week" } : {}, goal: 50 },
    { title: "تقييم المتابع", weight: 100 - w1, method: "manual", goal: 100, enteredBy: [ids.nancyUser], source: "مراجعة نانسي" },
  ] });
  const put = (cookie: string, body: unknown) => call(`/kpis/cards/${ids.testCard}/items`, { method: "PUT", cookie, body });
  assert.equal((await put(admin, { items: [items(70).items[0]] })).status, 400); // 70% only
  assert.equal((await put(admin, items(60, "nope"))).status, 400);
  assert.equal((await put(youssef, items(60))).status, 404);
  const saved = await put(admin, items(60));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.items.length, 2);
  assert.equal(saved.body.items[0].id, first.id, "the kept item keeps its id (and key)");
  assert.equal(saved.body.items[0].calc, "عدد المكالمات اللي سجّلها بنفسه على الليدز · آخر 7 أيام · متوسط في الأسبوع");
  assert.equal(saved.body.items[1].calc, "بيدخّله نانسي إسلام بإيده · من مراجعة نانسي");

  assert.equal((await call(`/kpis/cards/${ids.testCard}/follower`, { method: "PATCH", cookie: youssef, body: { followerId: ids.nancyEmp } })).status, 403);
  assert.equal((await call(`/kpis/cards/${ids.testCard}/follower`, { method: "PATCH", cookie: admin, body: { followerId: ids.nancyEmp } })).status, 204);
  assert.ok((await board(nancy, "team")).body.cards.some((c: { id: string }) => c.id === ids.testCard));

  assert.equal((await call(`/kpis/cards/${ids.testCard}/pay`, { method: "PATCH", cookie: hadeer, body: { base: "bonus", period: "quarter", amount: "6000" } })).status, 403);
  assert.equal((await call(`/kpis/cards/${ids.testCard}/pay`, { method: "PATCH", cookie: nancy, body: { base: "bonus", period: "quarter", amount: "6000" } })).status, 204);
  const paid = (await call(`/kpis/cards/${ids.testCard}`, { cookie: nancy })).body;
  assert.equal(paid.pay.amount, "6000.00");
  // nothing measured yet: 0% → under the Threshold, the bonus is cancelled (salary 0 in the seed)
  assert.equal(paid.pay.delta, "-6000.00");

  const bands = { top: 100, full: 96, partial: 70, low: 50, rewardPercent: 15, cutPercent: 15 };
  assert.equal((await call("/kpis/bands", { method: "PUT", cookie: hadeer, body: bands })).status, 403);
  assert.equal((await call("/kpis/bands", { method: "PUT", cookie: admin, body: { ...bands, partial: 99 } })).status, 400);
  assert.equal((await call("/kpis/bands", { method: "PUT", cookie: nancy, body: bands })).status, 204);
});

test("11.14 · the KPI watcher sees and edits every card, is told of changes, and never sees money", async () => {
  assert.equal((await call("/kpis/watchers", { method: "PUT", cookie: heba, body: { userIds: [ids.hebaUser] } })).status, 403);
  assert.equal((await call("/kpis/watchers", { method: "PUT", cookie: admin, body: { userIds: [ids.hebaUser] } })).status, 204);
  const all = await board(heba, "all");
  assert.equal(all.status, 200);
  assert.equal(all.body.seesMoney, false);
  assert.ok(all.body.cards.every((c: { money: string | null; tier: string }) => c.money === null && !/بونص|خصم|مكافأة/.test(c.tier)));
  const card = (await call(`/kpis/cards/${ids.testCard}`, { cookie: heba })).body;
  assert.equal(card.pay, null);
  assert.equal(card.can.manage, true);
  const company = (await call("/kpis/company", { cookie: heba })).body;
  assert.equal(company.bands, null);
  assert.equal((await call(`/kpis/cards/${ids.testCard}/pay`, { method: "PATCH", cookie: heba, body: { base: "salary", period: "month", amount: null } })).status, 403);
  const log = (await call("/kpis/log", { cookie: heba })).body as { text: string }[];
  assert.ok(log.some((l) => /اتعدّلت|بقى بيتابعه/.test(l.text)));
  assert.ok(!log.some((l) => /فلوس|شرايح/.test(l.text)), "no money in the watcher's log");
  assert.ok((await call("/kpis/log", { cookie: admin })).body.some((l: { text: string }) => /شرايح/.test(l.text)));
  // a change by someone else reaches her
  await call(`/kpis/cards/${ids.testCard}/follower`, { method: "PATCH", cookie: admin, body: { followerId: null } });
  const n = await prisma.notification.count({ where: { userId: ids.hebaUser, link: "/kpis", createdAt: { gte: start } } });
  assert.ok(n >= 1);
  assert.equal((await call("/kpis/log", { cookie: hadeer })).status, 403);
});

test("11.6 · mid-quarter: items under target are told to the owner and the follower once, on a working day from the 15th", async () => {
  const told = () => prisma.notification.count({ where: { userId: ids.youssefUser, link: "/kpis", text: { startsWith: "نص Q4 2026" } } });
  assert.equal(await kpiMidQuarterTick(new Date("2026-11-12T09:00:00Z")), 0); // before the middle of the quarter
  assert.equal(await kpiMidQuarterTick(new Date("2026-11-20T09:00:00Z")), 0); // a Friday
  assert.ok((await kpiMidQuarterTick(new Date("2026-11-16T09:00:00Z"))) >= 1);
  assert.equal(await told(), 1);
  const follower = (await prisma.employee.findUniqueOrThrow({ where: { id: ids.mahmoud } })).userId; // Youssef's Team Leader
  assert.ok(await prisma.notification.count({ where: { userId: follower, link: "/kpis", text: { startsWith: "نص Q4 2026" } } }) >= 1);
  assert.equal(await kpiMidQuarterTick(new Date("2026-11-17T09:00:00Z")), 0); // idempotent: once per card
  assert.equal(await told(), 1);
});

test("11.18 · the sheet's lines and award rules: the KPI admin sets them, a salesperson can't, the watcher doesn't see them (money)", async () => {
  fieldsBefore = (await prisma.kpiBands.findUniqueOrThrow({ where: { id: "default" } })).sheetFields;
  const c = (await call("/kpis/company", { cookie: admin })).body;
  assert.deepEqual(c.sheetSetup.fields, ["salary", "target", "achieved", "scheme", "commission", "bonus"].filter((k) => fieldsBefore!.includes(k)));
  assert.equal((await call("/kpis/company", { cookie: heba })).body.sheetSetup, null);
  assert.equal((await call("/kpis/sheet/fields", { method: "PUT", cookie: youssef, body: { fields: ["salary"] } })).status, 403);
  assert.equal((await call("/kpis/sheet/fields", { method: "PUT", cookie: admin, body: { fields: ["nope"] } })).status, 400);
  assert.equal((await call("/kpis/sheet/fields", { method: "PUT", cookie: admin, body: { fields: ["bonus", "salary", "transactions"] } })).status, 204);
  assert.deepEqual((await prisma.kpiBands.findUniqueOrThrow({ where: { id: "default" } })).sheetFields, ["salary", "transactions", "bonus"]);
  assert.equal((await call("/kpis/sheet/bonuses", { method: "POST", cookie: youssef, body: { minPct: 100, amount: "5000" } })).status, 403);
  assert.equal((await call("/kpis/sheet/bonuses", { method: "POST", cookie: admin, body: { minPct: 0, amount: "5000" } })).status, 400);
  const b = await call("/kpis/sheet/bonuses", { method: "POST", cookie: admin, body: { minPct: 120, amount: "10000" } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  const setup = (await call("/kpis/company", { cookie: admin })).body.sheetSetup;
  assert.ok(setup.bonuses.some((x: { id: string; minPct: number; amount: string }) => x.id === b.body.id && x.minPct === 120 && x.amount === "10000.00"));
  assert.equal(await prisma.auditLog.count({ where: { module: "kpis", entity: "KpiBonusRule", entityId: b.body.id, action: "create" } }), 1);
  assert.equal((await call(`/kpis/sheet/bonuses/${b.body.id}`, { method: "DELETE", cookie: youssef })).status, 403);
  assert.equal((await call(`/kpis/sheet/bonuses/${b.body.id}`, { method: "DELETE", cookie: admin })).status, 204);
  assert.equal((await call(`/kpis/sheet/bonuses/${b.body.id}`, { method: "DELETE", cookie: admin })).status, 404);
  // a rule stays for the sheets the close test makes below (the PDF carries the picked lines)
  assert.equal((await call("/kpis/sheet/bonuses", { method: "POST", cookie: admin, body: { minPct: 100, amount: "5000" } })).status, 201);
  assert.equal((await call("/kpis/sheet/fields", { method: "PUT", cookie: admin, body: { fields: ["salary", "target", "achieved", "scheme", "commission", "transactions", "bonus"] } })).status, 204);
});

test("11.19 · Manar: her card and her team's from the inventory, edits her own items but can't approve them, makes a card for her team", async () => {
  const manar = await session("manar.ahmed@places.com");
  const manarEmp = await prisma.employee.findFirstOrThrow({ where: { user: { email: "manar.ahmed@places.com" } }, select: { id: true } });
  const mine = await board(manar, "mine");
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  const own = mine.body.cards.find((c: { employeeId: string }) => c.employeeId === manarEmp.id);
  assert.ok(own, "her own card is on the board");
  // her own card: items yes (the same items saved back change nothing), approval no
  const view = (await call(`/kpis/cards/${own.id}`, { cookie: manar })).body;
  assert.equal(view.can.manage, true);
  assert.equal(view.can.approve, false);
  const items = view.items.map((it: Record<string, unknown>) => ({ id: it.id, title: it.title, weight: it.weight, targetText: it.targetText, source: it.source, method: it.method,
    module: it.module, direction: it.direction, goal: it.goal, metric: it.metric, params: it.params, enteredBy: it.enteredBy, required: it.required }));
  const saved = await call(`/kpis/cards/${own.id}/items`, { method: "PUT", cookie: manar, body: { items } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal((await call(`/kpis/cards/${own.id}/approve`, { method: "POST", cookie: manar })).status, 403);
  // a salesperson still can't change his own card's items
  const ys = (await board(youssef, "me")).body.cards[0];
  assert.equal((await call(`/kpis/cards/${ys.id}`, { cookie: youssef })).body.can.manage, false);

  // someone new on the inventory team: listed under «في الفريق من غير كارت KPIs», Manar makes his card and follows it
  const u = await prisma.user.create({ data: { email: `e2e-inv-${Date.now()}@e2e.test`, status: "ACTIVE" } });
  invTemp.user = u.id;
  invTemp.emp = (await prisma.employee.create({ data: { userId: u.id, name: "موظف انفنتوري تجربة", jobTitle: "Data Entry", department: "Inventory", salary: 0 } })).id;
  assert.ok((await board(manar, "mine")).body.missing.some((p: { id: string }) => p.id === invTemp.emp));
  assert.deepEqual((await board(youssef, "mine")).body.missing, []);
  assert.equal((await call("/kpis/cards", { method: "POST", cookie: youssef, body: { employeeId: invTemp.emp } })).status, 403);
  assert.equal((await call("/kpis/cards", { method: "POST", cookie: manar, body: { employeeId: ids.youssefEmp } })).status, 403); // not her team
  const made = await call("/kpis/cards", { method: "POST", cookie: manar, body: { employeeId: invTemp.emp } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal((await prisma.kpiCard.findUniqueOrThrow({ where: { id: made.body.id } })).followerId, manarEmp.id);
  assert.ok((await board(manar, "mine")).body.cards.some((c: { id: string }) => c.id === made.body.id));
  assert.equal(await prisma.auditLog.count({ where: { module: "kpis", entity: "KpiCard", entityId: made.body.id, action: "create" } }), 1);
});

// Under the KPI-quarter lock, and Q4 is open again before it's let go: the other files' KPI tests need it open.
test("11.4 · 11.6 · 11.7 · 11.11 · Nancy closes the quarter (alerts, payroll), approves the sheets, then a new quarter starts from a copy", () => kpiQuarterLock(async () => {
  try { await closeAndStartNext(); } finally { await reopenQ4(); }
}));

async function closeAndStartNext() {
  // Youssef was under 50% last quarter too: under 50% twice → HR review
  await prisma.kpiCard.create({ data: { quarter: "2026-Q3", employeeId: ids.youssefEmp, finalScore: 30 } });
  // the seed has no salaries: give Youssef one so his KPI amount and payroll line aren't zero (put back in `after`)
  salaryBefore = (await prisma.employee.findUniqueOrThrow({ where: { id: ids.youssefEmp } })).salary.toFixed(2);
  await prisma.employee.update({ where: { id: ids.youssefEmp }, data: { salary: 12_000 } });
  // a new quarter can't close the open one without its amounts (payroll would get no KPI line): close it first
  const early = await call("/kpis/quarter/next", { method: "POST", cookie: heba });
  assert.equal(early.status, 409);
  assert.equal(early.body.error, "اقفل الربع الحالي الأول");
  assert.equal((await call("/kpis/quarter/close", { method: "POST", cookie: heba })).status, 403);
  assert.equal((await call("/kpis/quarter/close", { method: "POST", cookie: nancy })).status, 204);
  assert.equal((await call(`/kpis/cards/${ids.testCard}/plan`, { method: "PATCH", cookie: admin, body: { plan: "x" } })).status, 409);
  const closed = await prisma.kpiCard.findUniqueOrThrow({ where: { id: ids.testCard } });
  assert.notEqual(closed.finalScore, null);

  // 11.6 the result's alerts
  const y = await prisma.kpiCard.findUniqueOrThrow({ where: { quarter_employeeId: { quarter: "2026-Q4", employeeId: ids.youssefEmp } } });
  if (Number(y.finalScore) < 50) {
    assert.ok(await prisma.notification.findFirst({ where: { userId: ids.youssefUser, link: "/kpis", text: { contains: "إنذار مكتوب" } } }));
    assert.ok(await prisma.notification.findFirst({ where: { userId: ids.basantUser, link: "/kpis", text: { contains: "ربعين ورا بعض" } } }));
  }
  // 11.6 the amount reaches this month's payroll line (live until HR approves; the payroll test may have approved meanwhile)
  const d = (await call("/hr/deductions", { cookie: await session("basant.elsawy@places.com") })).body;
  if (!d.approved) {
    const line = d.rows.find((r: { employeeId: string }) => r.employeeId === ids.youssefEmp);
    assert.notEqual(Number(y.finalAmount), 0);
    assert.equal(line.kpi, y.finalAmount!.toFixed(2));
    // the line is the attendance deduction minus the KPI amount, never above the salary (12,000)
    const p = (s: string) => Math.round(Number(s) * 100);
    assert.equal(p(line.amount), Math.min(12_000_00, Math.min(12_000_00, Math.round((12_000_00 / 26) * (line.attendanceDays + line.penaltyDays))) - p(line.kpi)));
  }

  // 11.7 the sheet: before the approval only the KPI admins; the watcher never (money)
  const card = (await board(youssef, "me")).body.cards[0].id;
  assert.equal((await fetch(`${API}/kpis/cards/${card}/sheet`, { headers: { cookie: youssef } })).status, 403);
  assert.equal((await fetch(`${API}/kpis/cards/${card}/sheet`, { headers: { cookie: heba } })).status, 403);
  const pdf = await fetch(`${API}/kpis/cards/${card}/sheet`, { headers: { cookie: nancy } });
  assert.equal(pdf.status, 200);
  assert.ok(Buffer.from(await pdf.arrayBuffer()).toString("latin1").startsWith("%PDF-"));
  assert.equal((await call("/kpis/quarter/sheets", { method: "POST", cookie: heba })).status, 403);
  const since = Date.now();
  const sent = await call("/kpis/quarter/sheets", { method: "POST", cookie: nancy });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.ok(sent.body.sent >= 32);
  const mail = lastMail("youssef.safwat@places.com", since) as { subject: string; attachments?: { filename: string; bytes: number }[] };
  assert.match(mail.subject, /Q4 2026/);
  assert.ok(mail.attachments?.[0]?.filename.endsWith(".pdf") && mail.attachments[0].bytes > 1000);
  assert.equal((await call("/kpis/quarter/sheets", { method: "POST", cookie: nancy })).status, 409);
  assert.equal((await fetch(`${API}/kpis/cards/${card}/sheet`, { headers: { cookie: youssef } })).status, 200);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "KpiSheets", entityId: "2026-Q4", action: "approve" } }));

  assert.equal((await call("/kpis/quarter/next", { method: "POST", cookie: hadeer })).status, 403);
  const next = await call("/kpis/quarter/next", { method: "POST", cookie: heba });
  assert.equal(next.status, 201, JSON.stringify(next.body));
  assert.equal(next.body.quarter, "2027-Q1");
  const me = (await board(youssef, "me")).body;
  assert.equal(me.quarter.label, "Q1 2027");
  const copy = (await call(`/kpis/cards/${me.cards[0].id}`, { cookie: youssef })).body;
  assert.equal(copy.items.length, 7);
  assert.ok(copy.items.every((it: { value: number | null; delivered: number }) => it.value === null && it.delivered === 0));
  const tl = await prisma.kpiCard.findFirstOrThrow({ where: { quarter: "2027-Q1", employeeId: ids.mahmoud }, include: { items: true } });
  assert.equal(tl.items[0]!.title, "تحقيق تارجت الفريق", "the TLs' seeded card isn't replaced");
  const company = (await call("/kpis/company", { cookie: admin })).body;
  assert.ok(company.quarters.some((q: { id: string; status: string }) => q.id === "2026-Q4" && q.status === "closed"));
}
