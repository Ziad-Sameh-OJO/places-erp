/**
 * M-12 · 11.10: the scheduled reports run here. An auto report is built once per period at its time (a ReportRun: the
 * rows, listed under the report and downloadable as Excel) and its recipients hear of it in the app; a hand-in report
 * reminds each person `remindMin` before the deadline and tells `lateNotify` once after it. No e-mail yet: the worker
 * has no mail sender, so the file waits in «التقارير ومواعيدها».
 * Idempotent: one ReportRun per (report, period) and each hand-in's remindedAt / lateAt are claimed before anyone is told.
 * A report never sends or chases a period due before it existed (first run), and the daily report skips days off.
 */
import { performanceRows, prisma } from "@places/db";
import { type Schedule, dueOf, handInStep, isOffPeriod, pickPeople } from "@places/domain";
import { inventoryReportRun } from "./inventory-report.ts";
import { pushEvent } from "../push.ts";
import { workCalendar } from "../calendar.ts";

const hm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

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
      const built = await performanceRows(prisma, s, period, cal);
      const to = [...pickPeople(r.recipients, users), ...(r.money ? [] : watchers)];
      const text = `اتبعت تقرير «${r.name}» (${r.fmt}) · ${built.title}`;
      const sent = await prisma.$transaction(async (tx) => {
        const made = await tx.reportRun.createMany({ data: [{ reportId: r.id, period, title: built.title, rows: built.rows }], skipDuplicates: true });
        if (made.count && to.length) await tx.notification.createMany({ data: [...new Set(to)].map((userId) => ({ userId, event: "report.sent", text, link })) });
        return made.count > 0;
      });
      if (sent) await pushEvent("report.sent", { userIds: to, text, link });
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
      const told = await prisma.$transaction(async (tx) => {
        await tx.reportHandIn.createMany({ data: [{ reportId: r.id, userId, period }], skipDuplicates: true });
        const claimed = await tx.reportHandIn.updateMany({ where: { reportId: r.id, userId, period, at: null, ...(step === "remind" ? { remindedAt: null } : { lateAt: null }) }, data: step === "remind" ? { remindedAt: now } : { lateAt: now } });
        if (claimed.count) await tx.notification.createMany({ data: to.map((u) => ({ userId: u, event: step === "remind" ? "report.remind" : "report.late", text, link, important: step === "late" })) });
        return claimed.count > 0;
      });
      if (told) await pushEvent(step === "remind" ? "report.remind" : "report.late", { userIds: to, text, link });
    }
  }
}
