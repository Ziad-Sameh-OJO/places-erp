/**
 * M-05 · «الترفيه والاحتفالات» (HR, 15 Nov) end-to-end: HR plans a fun day for everyone and one for a department,
 * everyone it's for sees it and is told «يوم <التاريخ>: <العنوان>», a sales account can read but not plan, a new
 * date tells people again, cancelling hides it, and the worker's reminders go once.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { localDate } from "@places/domain";
import { call, mark, session } from "./helpers.ts";
import { funDayRemindersTick } from "../../worker/src/processors/fun-day-reminders.ts";

const stamp = Date.now().toString(36);
const T = `FD${stamp}`;
const START = new Date();
let hr: string, sales: string, marketing: string, salesId: string, marketingId: string;
const addDays = (n: number) => new Date(Date.parse(`${localDate(new Date())}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

before(async () => {
  mark(T);
  [hr, sales, marketing] = await Promise.all(["basant.elsawy@places.com", "anas@places.com", "rahma.hassan@places.com"].map((e) => session(e)));
  [salesId, marketingId] = await Promise.all(["anas@places.com", "rahma.hassan@places.com"].map(async (email) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id));
});

after(async () => {
  const ids = (await prisma.companyEvent.findMany({ where: { title: { startsWith: T } }, select: { id: true } })).map((e) => e.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { text: { contains: T }, createdAt: { gte: START } } });
  await prisma.companyEvent.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

const notices = (userId: string, event: string, title = T) => prisma.notification.findMany({ where: { userId, event, text: { contains: title } } });
const body = (title: string, date: string, departments: string[] = []) => ({ title, date, time: "15:00", place: "المكتب", description: "أكل ومسابقات", departments });

test("a sales account reads the fun days but can't plan them", async () => {
  assert.equal((await call("/hr/fun-days", { cookie: sales })).status, 200);
  assert.equal((await call("/hr/fun-days/upcoming", { cookie: sales })).status, 200);
  assert.equal((await call("/hr/fun-days/plan", { cookie: sales })).status, 403);
  assert.equal((await call("/hr/fun-days", { method: "POST", cookie: sales, body: body(`${T} ممنوع`, addDays(5)) })).status, 403);
  assert.equal((await call("/hr/fun-days", {})).status, 401);
});

test("HR's plan offers the year's occasions as starters", async () => {
  const r = await call("/hr/fun-days/plan?year=2027", { cookie: hr });
  assert.equal(r.status, 200);
  const plan = r.body as { starters: Array<{ key: string; date: string | null }>; departments: string[] };
  assert.equal(plan.starters.find((s) => s.key === "newYear")?.date, "2027-01-01");
  assert.ok(plan.departments.includes("Marketing"));
});

test("published for everyone: everyone sees it and is told «يوم <التاريخ>: <العنوان>»; a new date tells them again; cancelled = gone", async () => {
  const date = addDays(6);
  const r = await call("/hr/fun-days", { method: "POST", cookie: hr, body: body(`${T} للكل`, date) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = (r.body as { id: string }).id;
  const [n] = await notices(salesId, "hr.fun_day");
  assert.match(n!.text, new RegExp(`^يوم .+: ${T} للكل · الساعة 15:00 · في المكتب$`));
  const up = (await call("/hr/fun-days/upcoming", { cookie: sales })).body as Array<{ id: string }>;
  assert.ok(up.some((e) => e.id === id));
  assert.equal((await prisma.auditLog.count({ where: { entityId: id, action: "create" } })), 1);

  // only a new date is announced again
  assert.equal((await call(`/hr/fun-days/${id}`, { method: "PUT", cookie: hr, body: { ...body(`${T} للكل`, date), place: "النادي" } })).status, 200);
  assert.equal((await notices(salesId, "hr.fun_day")).length, 1);
  assert.equal((await call(`/hr/fun-days/${id}`, { method: "PUT", cookie: hr, body: body(`${T} للكل`, addDays(7)) })).status, 200);
  assert.equal((await notices(salesId, "hr.fun_day")).length, 2);

  assert.equal((await call(`/hr/fun-days/${id}/cancel`, { method: "POST", cookie: sales })).status, 403);
  assert.equal((await call(`/hr/fun-days/${id}/cancel`, { method: "POST", cookie: hr })).status, 204);
  const year = addDays(7).slice(0, 4);
  const list = (await call(`/hr/fun-days?year=${year}`, { cookie: sales })).body as Array<{ id: string }>;
  assert.ok(!list.some((e) => e.id === id));
  assert.equal((await prisma.auditLog.count({ where: { entityId: id, action: "cancel" } })), 1);
});

test("for one department: only its people see it and hear of it", async () => {
  const date = addDays(8);
  const r = await call("/hr/fun-days", { method: "POST", cookie: hr, body: body(`${T} للتسويق`, date, ["Marketing"]) });
  assert.equal(r.status, 201);
  const id = (r.body as { id: string }).id;
  const seen = async (cookie: string) => ((await call(`/hr/fun-days?year=${date.slice(0, 4)}`, { cookie })).body as Array<{ id: string }>).some((e) => e.id === id);
  assert.equal(await seen(marketing), true);
  assert.equal(await seen(sales), false);
  assert.equal((await notices(marketingId, "hr.fun_day", `${T} للتسويق`)).length, 1);
  assert.equal((await notices(salesId, "hr.fun_day", `${T} للتسويق`)).length, 0);
});

test("the worker reminds the day before and on the morning, once each", async () => {
  const date = addDays(10);
  const r = await call("/hr/fun-days", { method: "POST", cookie: hr, body: body(`${T} تذكير`, date) });
  const id = (r.body as { id: string }).id;
  await prisma.companyEvent.update({ where: { id }, data: { notifiedAt: new Date(Date.now() - 86_400_000) } });
  const dayBefore = new Date(`${addDays(9)}T08:00:00Z`); // 10:00–11:00 Cairo
  await funDayRemindersTick(dayBefore);
  await funDayRemindersTick(dayBefore); // a retry sends nothing more
  let got = await notices(salesId, "hr.fun_day_reminder");
  assert.equal(got.length, 1);
  assert.match(got[0]!.text, /^بكره · /);
  await funDayRemindersTick(new Date(`${date}T08:00:00Z`));
  got = await notices(salesId, "hr.fun_day_reminder");
  assert.equal(got.length, 2);
  assert.ok(got.some((n) => n.text.startsWith("النهارده · ")));
});
