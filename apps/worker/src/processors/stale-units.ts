/**
 * M-03 2.4 · (21) · 2.17: a unit whose «last update» is over a month old counts late (isStale, shown on the unit and in
 * Manar's / Randa's activity) and gets a follow-up task with its owner: Randa for Resale, Manar for the rest
 * (followupRole). The unit stays visible and available to sales. Only on a working day (Friday and the official
 * holidays are off), and never a second open follow-up for the same unit, so running twice changes nothing.
 */
import { prisma } from "@places/db";
import { DEFAULT_LEAD_RULES, PLACES_CALENDAR, type LeadRules, calendarOf, followupRole, holidayDays, isWorkingDay, localDate, needsFollowup, staleBefore } from "@places/domain";

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function staleUnitsTick(now = new Date()): Promise<number> {
  const work = ((await prisma.setting.findUnique({ where: { key: "leadRules" } }))?.value as Partial<LeadRules> | null)?.work ?? DEFAULT_LEAD_RULES.work;
  const holidays = holidayDays((await prisma.holiday.findMany()).map((h) => ({ from: day(h.from), to: day(h.to) })));
  const calendar = { ...calendarOf({ ...DEFAULT_LEAD_RULES, work }, PLACES_CALENDAR), holidays };
  const today = localDate(now);
  if (!isWorkingDay(today, calendar)) return 0;

  const stale = await prisma.unit.findMany({
    where: { archivedAt: null, lastOwnerUpdateAt: { lt: staleBefore(now) }, OR: [{ status: "available" }, { alsoStatus: "available" }] },
    select: { id: true, code: true, type: true, project: true, tasks: { where: { kind: "followup", status: { not: "done" } }, select: { id: true } } },
  });
  const todo = stale.filter((u) => needsFollowup({ stale: true, openFollowup: u.tasks.length > 0 }));
  if (!todo.length) return 0;
  const people = new Map<string, string | null>();
  for (const role of new Set(todo.map((u) => followupRole(u.type)))) {
    const p = await prisma.user.findFirst({ where: { status: "ACTIVE", roles: { some: { role: { key: role } } } }, orderBy: { createdAt: "asc" }, select: { id: true } });
    people.set(role, p?.id ?? null);
  }
  let made = 0;
  for (const u of todo) {
    const to = people.get(followupRole(u.type));
    if (!to) continue;
    await prisma.$transaction(async (tx) => {
      // only if nobody opened one meanwhile
      if (await tx.task.count({ where: { unitId: u.id, kind: "followup", status: { not: "done" } } })) return;
      const t = await tx.task.create({ data: { kind: "followup", unitId: u.id, byUserId: null, toUserId: to, dueOn: new Date(`${today}T00:00:00Z`), note: "last update عدّى عليه أكتر من شهر · كلّم المالك" }, select: { id: true } });
      await tx.auditLog.create({ data: { module: "tasks", entity: "Task", entityId: t.id, action: "create", after: { kind: "followup", unitId: u.id, toUserId: to, by: "system" } } });
      // in-app only, like the other jobs: the worker has no mail service yet
      await tx.notification.create({ data: { userId: to, text: `متابعة مع المالك: ${u.code} (${u.project}) · الـ last update عدّى عليه أكتر من شهر`, link: `/tasks?id=${t.id}`, important: false } });
      made++;
    });
  }
  return made;
}
