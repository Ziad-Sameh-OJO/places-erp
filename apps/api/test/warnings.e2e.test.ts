/**
 * M-05 · warnings and the improvement plan (HR, 15 Nov). The daily check flags who reached HR's rule this month, once;
 * HR issues it as a PDF from the template (or writes one by hand) — HR only. HR asks the KPI follower for a plan for
 * someone under the threshold; only that TL writes it; HR follows and closes it with a note; sales sees none of it.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@places/db";
import { call, session } from "./helpers.ts";
import { workingDay } from "../../worker/src/calendar.ts";
import { warningCheckTick } from "../../worker/src/processors/warning-check.ts";

const START = new Date();
const RULE = `e2e-${START.getTime()}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
let basant: string, tl: string, otherTl: string, sales: string, mohsen: string;
let saved: { rules?: unknown; template?: unknown; threshold?: unknown } = {};
const keys = ["warningRules", "warningTemplate", "improvementThreshold"] as const;

before(async () => {
  [basant, tl, otherTl, sales] = await Promise.all(["basant.elsawy@places.com", "abdallah.sleem@places.com", "mahmoud.ali@places.com", "m.mohsen@places.com"].map((e) => session(e)));
  mohsen = (await prisma.employee.findFirstOrThrow({ where: { user: { email: "m.mohsen@places.com" } } })).id;
  const [r, t, th] = await Promise.all(keys.map((key) => prisma.setting.findUnique({ where: { key } })));
  saved = { rules: r?.value, template: t?.value, threshold: th?.value };
});

after(async () => {
  const warnings = await prisma.warning.findMany({ where: { OR: [{ rule: RULE }, { reason: { startsWith: RULE } }] }, select: { id: true, fileId: true } });
  const plans = await prisma.improvementPlan.findMany({ where: { employeeId: mohsen, createdAt: { gte: START } }, select: { id: true } });
  const ids = [...warnings.map((w) => w.id), ...plans.map((p) => p.id)];
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { entity: "Setting", entityId: { in: [...keys] }, at: { gte: START } }] } });
  await prisma.file.deleteMany({ where: { id: { in: warnings.map((w) => w.fileId ?? "") } } });
  await prisma.warning.deleteMany({ where: { id: { in: warnings.map((w) => w.id) } } });
  await prisma.improvementPlan.deleteMany({ where: { id: { in: plans.map((p) => p.id) } } });
  await prisma.penalty.deleteMany({ where: { text: { startsWith: RULE } } });
  for (const [key, value] of [["warningRules", saved.rules], ["warningTemplate", saved.template], ["improvementThreshold", saved.threshold]] as const) {
    if (value === undefined) await prisma.setting.deleteMany({ where: { key } });
    else await prisma.setting.update({ where: { key }, data: { value: value as never } });
  }
  await prisma.notification.deleteMany({ where: { event: "hr.improvement_plan", createdAt: { gte: START } } });
  await prisma.$disconnect();
});

test("HR's rule → the daily check flags it once → HR's «مهامي النهارده» → HR issues the PDF; HR only", async () => {
  assert.equal((await call("/hr/warnings", { cookie: sales })).status, 403);
  assert.equal((await call("/hr/warnings", { cookie: tl })).status, 403);
  assert.equal((await call("/hr/warnings/settings", { method: "PUT", cookie: basant, body: { rules: [{ id: RULE, trigger: "penalties", min: 1, type: "جزاء" }], template: "إنذار من غير مكان للنوع" } })).status, 400);
  const put = await call("/hr/warnings/settings", { method: "PUT", cookie: basant, body: { rules: [{ id: RULE, trigger: "penalties", min: 1, type: "جزاءات الشهر" }], template: "تم توجيه إنذار لكم بسبب: {type}." } });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal((await call("/hr/warnings/settings", { cookie: basant })).body.rules[0].id, RULE);

  // one approved penalty this month reaches the rule (min 1); the check runs on a working day of this month
  await prisma.penalty.create({ data: { employeeId: mohsen, day: new Date(`${today()}T00:00:00Z`), text: `${RULE} تأخير`, byUserId: "e2e", status: "approved" } });
  let now = new Date();
  while (!(await workingDay(now))) now = new Date(now.getTime() - 86_400_000);
  if ((await workingDay(now))!.slice(0, 7) !== today().slice(0, 7)) return; // the month began on a day off: nothing to check yet
  await warningCheckTick(now);
  await warningCheckTick(now); // idempotent
  const flagged = await prisma.warning.findMany({ where: { rule: RULE, employeeId: mohsen } });
  assert.equal(flagged.length, 1);
  assert.match(flagged[0]!.reason, /^\d+ جزاءات الشهر ده \(القاعدة 1\)$/);
  const w = flagged[0]!.id;

  const lines = (await call("/home/hr", { cookie: basant })).body as { kind: string; id: string }[];
  assert.ok(lines.some((l) => l.kind === "warningDue" && l.id === w));
  assert.ok(!((await call("/home/hr", { cookie: tl })).body as { kind: string }[]).some((l) => l.kind === "warningDue"));

  assert.equal((await call(`/hr/warnings/${w}/issue`, { method: "POST", cookie: tl, body: { type: "x x" } })).status, 403);
  const issued = await call(`/hr/warnings/${w}/issue`, { method: "POST", cookie: basant, body: { type: "خد جزاءات كتير" } });
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  assert.equal(issued.body.status, "issued");
  assert.equal(issued.body.hasPdf, true);
  assert.equal((await call(`/hr/warnings/${w}/issue`, { method: "POST", cookie: basant, body: { type: "تاني" } })).status, 400);
  assert.equal((await call(`/hr/warnings/${w}/dismiss`, { method: "POST", cookie: basant })).status, 400);
  const pdf = await call(`/hr/warnings/${w}/pdf`, { cookie: basant });
  assert.equal(pdf.status, 200);
  assert.equal((await fetch(pdf.body.url)).headers.get("content-type"), "application/pdf");
  assert.equal((await call(`/hr/warnings/${w}/pdf`, { cookie: tl })).status, 403);
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "Warning", entityId: w, action: "issue" } }));

  // by hand: issued at once; the person's list has both
  const hand = await call("/hr/warnings", { method: "POST", cookie: basant, body: { employeeId: mohsen, reason: `${RULE} خناقة مع زميل`, type: "سلوك" } });
  assert.equal(hand.status, 201, JSON.stringify(hand.body));
  assert.equal(hand.body.status, "issued");
  const mine = (await call(`/hr/warnings?employeeId=${mohsen}`, { cookie: basant })).body as { id: string }[];
  assert.ok([w, hand.body.id].every((id) => mine.some((x) => x.id === id)));
});

test("improvement plan: HR asks the KPI follower, only he writes it, HR follows and closes it; sales sees nothing", async () => {
  assert.equal((await call("/hr/improvement/threshold", { method: "PUT", cookie: tl, body: { threshold: 100 } })).status, 403);
  assert.equal((await call("/hr/improvement/threshold", { method: "PUT", cookie: basant, body: { threshold: 100 } })).status, 200);
  const v = (await call("/hr/improvement", { cookie: basant })).body;
  assert.equal(v.threshold, 100);
  assert.ok(v.candidates.some((c: { employeeId: string }) => c.employeeId === mohsen), "mohsen's live card is under 100%");
  assert.equal((await call("/hr/improvement", { cookie: sales })).status, 403);
  assert.equal((await call("/hr/improvement", { method: "POST", cookie: tl, body: { employeeId: mohsen } })).status, 403);

  const r = await call("/hr/improvement", { method: "POST", cookie: basant, body: { employeeId: mohsen } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, "requested");
  assert.equal((await call("/hr/improvement", { method: "POST", cookie: basant, body: { employeeId: mohsen } })).status, 409);
  const id = r.body.id as string;

  const tlView = (await call("/hr/improvement", { cookie: tl })).body;
  assert.equal(tlView.candidates.length, 0);
  assert.ok(tlView.plans.some((p: { id: string; canSubmit: boolean }) => p.id === id && p.canSubmit));
  assert.ok(!(await call("/hr/improvement", { cookie: otherTl })).body.plans.some((p: { id: string }) => p.id === id));
  assert.ok(((await call("/home/hr", { cookie: tl })).body as { kind: string; id: string }[]).some((l) => l.kind === "planRequested" && l.id === id));
  assert.ok(await prisma.notification.findFirst({ where: { event: "hr.improvement_plan", userId: (await prisma.user.findUniqueOrThrow({ where: { email: "abdallah.sleem@places.com" } })).id, createdAt: { gte: START } } }));

  const plan = { goals: "يقفل 2 صفقة", actions: "متابعة يومية مع الـ TL", dueDate: today() };
  assert.equal((await call(`/hr/improvement/${id}/submit`, { method: "POST", cookie: otherTl, body: plan })).status, 404);
  assert.equal((await call(`/hr/improvement/${id}/step`, { method: "POST", cookie: basant, body: { step: "follow" } })).status, 400); // not sent yet
  const sent = await call(`/hr/improvement/${id}/submit`, { method: "POST", cookie: tl, body: plan });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.status, "submitted");
  assert.equal((await call(`/hr/improvement/${id}/step`, { method: "POST", cookie: tl, body: { step: "follow" } })).status, 403);
  assert.equal((await call(`/hr/improvement/${id}/step`, { method: "POST", cookie: basant, body: { step: "follow" } })).body.status, "follow_up");
  assert.equal((await call(`/hr/improvement/${id}/submit`, { method: "POST", cookie: tl, body: plan })).status, 400);
  assert.ok(((await call("/home/hr", { cookie: basant })).body as { kind: string; id: string }[]).some((l) => l.kind === "planDue" && l.id === id)); // due today
  assert.equal((await call(`/hr/improvement/${id}/step`, { method: "POST", cookie: basant, body: { step: "close" } })).status, 400); // a note
  const closed = await call(`/hr/improvement/${id}/step`, { method: "POST", cookie: basant, body: { step: "close", note: "اتحسن" } });
  assert.equal(closed.body.status, "closed");
  assert.ok(await prisma.auditLog.findFirst({ where: { entity: "ImprovementPlan", entityId: id, action: "close" } }));
});
