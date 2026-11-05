/**
 * M-12 · 11.10: the scheduled reports run here. An auto report is built once per period at its time (a ReportRun: the
 * rows, listed under the report and downloadable as Excel) and its recipients hear of it in the app; a hand-in report
 * reminds each person `remindMin` before the deadline and tells `lateNotify` once after it. No e-mail yet: the worker
 * has no mail sender, so the file waits in «التقارير ومواعيدها».
 * Idempotent: one ReportRun per (report, period) and each hand-in's remindedAt / lateAt are claimed before anyone is told.
 * A report never sends or chases a period due before it existed (first run), and the daily report skips days off.
 */
import { prisma } from "@places/db";
import {
  DEFAULT_LEAD_RULES, PLACES_CALENDAR, type LeadRules, type Schedule, type WorkCalendar, calendarOf, dayStart, dealRowOf, dueOf, handInStep, holidayDays,
  isOffPeriod, monthBounds, monthLabel, periodFigures, pickPeople, targetPercent, toDecimal, fromDecimal,
} from "@places/domain";
import { inventoryReportRun } from "./inventory-report.ts";

const day = (d: Date) => d.toISOString().slice(0, 10);
const hm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const shift = (iso: string, days: number) => day(new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000));

export async function workCalendar(): Promise<WorkCalendar> {
  const work = ((await prisma.setting.findUnique({ where: { key: "leadRules" } }))?.value as Partial<LeadRules> | null)?.work ?? DEFAULT_LEAD_RULES.work;
  const holidays = holidayDays((await prisma.holiday.findMany()).map((h) => ({ from: day(h.from), to: day(h.to) })));
  return { ...calendarOf({ ...DEFAULT_LEAD_RULES, work }, PLACES_CALENDAR), holidays };
}

async function activeUsers() {
  const rows = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, roles: { select: { role: { select: { key: true } } } }, employee: { select: { id: true, name: true } } } });
  return rows.map((u) => ({ id: u.id, roles: u.roles.map((r) => r.role.key), employeeId: u.employee?.id ?? null, name: u.employee?.name ?? "" }));
}

/** «المتابع بتاع الشخص»: his KPI card's follower this quarter, or his manager (same rule as the API). */
async function followerOf(employeeId: string | null, quarter: string | undefined) {
  if (!employeeId) return null;
  const card = quarter ? await prisma.kpiCard.findUnique({ where: { quarter_employeeId: { quarter, employeeId } }, select: { follower: { select: { userId: true } } } }) : null;
  return card?.follower?.userId ?? (await prisma.employee.findUnique({ where: { id: employeeId }, select: { manager: { select: { userId: true } } } }))?.manager?.userId ?? null;
}

/** Every active salesperson's achievement in [from, to) against his monthly target (11.8 rules). */
export async function salesFigures(month: string, from: Date, to: Date) {
  const people = await prisma.employee.findMany({
    where: { user: { status: "ACTIVE", roles: { some: { role: { key: "sales" } } } } },
    select: { id: true, name: true, team: true, target: true, teamLeaderId: true, teamLeader: { select: { name: true, userId: true } } }, orderBy: { name: "asc" },
  });
  const ids = people.map((p) => p.id);
  const [targets, deals] = await Promise.all([
    prisma.salesTarget.findMany({ where: { month, employeeId: { in: ids } } }),
    prisma.deal.findMany({ where: { participants: { some: { employeeId: { in: ids } } }, payments: { some: { receivedAt: { gte: from, lt: to } } } }, include: { participants: true, payments: true } }),
  ]);
  const rows = deals.map((d) => dealRowOf({ ...d, commissionOwner: d.commissionOwner.toFixed(2), commissionClient: d.commissionClient.toFixed(2), targetBase: d.targetBase?.toFixed(2) ?? null,
    payments: d.payments.map((p) => ({ side: p.side, amount: p.amount.toFixed(2), receivedAt: p.receivedAt })) }));
  return people.map((p) => {
    const t = targets.find((x) => x.employeeId === p.id), goal = fromDecimal((t?.value ?? p.target).toFixed(2));
    return { ...p, goal, ...periodFigures(p.id, rows, from, to) };
  });
}

/** The period a report covers when it runs on `period`: the day / 7 days / month / 3 months before it, and the one before that. */
function windows(s: Schedule, period: string, cal: WorkCalendar) {
  if (s.freq === "daily" || s.freq === "weekly") {
    const n = s.freq === "daily" ? 1 : 7, at = (x: string) => dayStart(x, cal);
    return { month: shift(period, -1).slice(0, 7), label: `${shift(period, -n)} → ${shift(period, -1)}`, cur: [at(shift(period, -n)), at(period)] as const, prev: [at(shift(period, -2 * n)), at(shift(period, -n))] as const };
  }
  const months = s.freq === "monthly" ? 1 : 3;
  let first = period.slice(0, 7);
  for (let i = 0; i < months; i++) first = monthBounds(first, cal).prev;
  let before = first;
  for (let i = 0; i < months; i++) before = monthBounds(before, cal).prev;
  return { month: first, label: monthLabel(first), cur: [monthBounds(first, cal).from, dayStart(`${period.slice(0, 7)}-01`, cal)] as const, prev: [monthBounds(before, cal).from, monthBounds(first, cal).from] as const };
}

/** 11.10 «تقرير الأداء»: every salesperson and every team, against the period before. Column names are the Excel headers. */
export async function performanceRows(s: Schedule, period: string, cal: WorkCalendar) {
  const w = windows(s, period, cal);
  const [cur, prev] = await Promise.all([salesFigures(w.month, ...w.cur), salesFigures(w.month, ...w.prev)]);
  const row = (name: string, team: string, goal: number, achieved: number, transactions: number, before: number) => ({
    "الاسم": name, "الفريق": team, "التارجت الشهري": toDecimal(goal), "دخل في التارجت": toDecimal(achieved), "النسبة من التارجت": `${Math.round(targetPercent(achieved, goal))}%`,
    "Transactions": transactions, "الفترة اللي قبلها": toDecimal(before), "الفرق": toDecimal(achieved - before),
  });
  const before = (id: string) => prev.find((x) => x.id === id)?.achieved ?? 0;
  const people = cur.map((p) => row(p.name, p.team ?? "", p.goal, p.achieved, p.transactions, before(p.id)));
  const teams = [...new Set(cur.flatMap((p) => (p.teamLeaderId ? [p.teamLeaderId] : [])))].map((tl) => {
    const m = cur.filter((p) => p.teamLeaderId === tl), sum = (f: (x: (typeof m)[number]) => number) => m.reduce((a, x) => a + f(x), 0);
    return row(`فريق ${m[0]!.teamLeader!.name}`, m[0]!.team ?? "", sum((x) => x.goal), sum((x) => x.achieved), sum((x) => x.transactions), sum((x) => before(x.id)));
  });
  return { title: `${s.freq === "monthly" ? "تقرير الأداء الشهري" : "تقرير الأداء"} · ${w.label}`, rows: [...people, ...teams] };
}

export async function scheduledReportsTick(now = new Date()): Promise<void> {
  const reports = await prisma.scheduledReport.findMany({ where: { on: true } });
  if (!reports.length) return;
  const [cal, users, watch, q] = await Promise.all([
    workCalendar(), activeUsers(), prisma.setting.findUnique({ where: { key: "kpiWatch" } }), prisma.kpiQuarter.findFirst({ orderBy: { id: "desc" } }),
  ]);
  const watchers = Array.isArray(watch?.value) ? watch.value.filter((x): x is string => typeof x === "string") : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  for (const r of reports) {
    const s: Schedule = { freq: r.freq as Schedule["freq"], day: r.day, time: r.time };
    const { period, due } = dueOf(s, now, cal);
    if (isOffPeriod(s, period, cal) || due <= r.createdAt) continue;
    const link = r.daily ? "/kpis" : "/reports";
    if (r.kind === "auto" && r.content === "inventory") {
      // M-03 3.1 · 2.18: counted now, sent to the recipients once whoever prepares it (Manar) approves it
      if (now >= due) await inventoryReportRun(r, period, now, pickPeople(r.preparedBy, users), [...pickPeople(r.recipients, users), ...(r.money ? [] : watchers)]);
      continue;
    }
    if (r.kind === "auto") {
      if (now < due || r.content !== "performance" || (await prisma.reportRun.findUnique({ where: { reportId_period: { reportId: r.id, period } } }))) continue;
      const built = await performanceRows(s, period, cal);
      const to = [...pickPeople(r.recipients, users), ...(r.money ? [] : watchers)];
      await prisma.$transaction(async (tx) => {
        const made = await tx.reportRun.createMany({ data: [{ reportId: r.id, period, title: built.title, rows: built.rows }], skipDuplicates: true });
        if (made.count && to.length) await tx.notification.createMany({ data: [...new Set(to)].map((userId) => ({ userId, text: `اتبعت تقرير «${r.name}» (${r.fmt}) · ${built.title}`, link })) });
      });
      continue;
    }
    const done = new Map((await prisma.reportHandIn.findMany({ where: { reportId: r.id, period } })).map((h) => [h.userId, h]));
    for (const userId of pickPeople(r.preparedBy, users)) {
      const h = done.get(userId);
      if (h?.at) continue;
      const step = handInStep(due, r.remindMin, now, { reminded: !!h?.remindedAt, late: !!h?.lateAt });
      if (!step) continue;
      const to = step === "remind" ? [userId]
        : [...new Set([...pickPeople(r.lateNotify, users, await followerOf(users.find((u) => u.id === userId)?.employeeId ?? null, q?.id)), userId, ...(r.money ? [] : watchers)])];
      const text = step === "remind" ? `تذكير: سلّم «${r.name}» قبل ${hm(due)}` : `${nameOf.get(userId) || "حد"} ماسلّمش «${r.name}» في ميعاده (${hm(due)})`;
      await prisma.$transaction(async (tx) => {
        await tx.reportHandIn.createMany({ data: [{ reportId: r.id, userId, period }], skipDuplicates: true });
        const claimed = await tx.reportHandIn.updateMany({ where: { reportId: r.id, userId, period, at: null, ...(step === "remind" ? { remindedAt: null } : { lateAt: null }) }, data: step === "remind" ? { remindedAt: now } : { lateAt: now } });
        if (claimed.count) await tx.notification.createMany({ data: to.map((u) => ({ userId: u, text, link, important: step === "late" })) });
      });
    }
  }
}
