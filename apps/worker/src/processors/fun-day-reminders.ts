/**
 * M-05 · fun days (HR, 15 Nov): the reminder the day before and on the morning of an event, to everyone it's for.
 * Hourly; dueFunDayReminders decides (from 09:00 Cairo, once each), and each reminder is claimed by setting its
 * «sent» column in the same transaction as the notifications, so a retry never sends it twice. Every day of the
 * week: a celebration on a day off still gets its reminders.
 */
import { prisma } from "@places/db";
import { dueFunDayReminders, eventByKey, funDayText, localDate } from "@places/domain";
import { pushEvent } from "../push.ts";

const EVENT = "hr.fun_day_reminder";
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function funDayRemindersTick(now = new Date()): Promise<void> {
  const today = localDate(now);
  // only today's and tomorrow's can be due
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86_400_000);
  const rows = await prisma.companyEvent.findMany({ where: { cancelledAt: null, date: { gte: new Date(`${today}T00:00:00Z`), lt: until } } });
  const ev = eventByKey(EVENT)!;
  for (const e of rows) {
    for (const r of dueFunDayReminders({ ...e, date: day(e.date), cancelled: false }, now)) {
      const column = r === "dayBefore" ? "dayBeforeSentAt" : "morningSentAt";
      const text = funDayText({ ...e, date: day(e.date) }, r);
      const link = `/events?open=${e.id}`;
      const to = await prisma.$transaction(async (tx) => {
        const claimed = await tx.companyEvent.updateMany({ where: { id: e.id, [column]: null }, data: { [column]: now } });
        if (!claimed.count) return [];
        const people = await tx.user.findMany({ where: { status: "ACTIVE", ...(e.departments.length ? { employee: { department: { in: e.departments } } } : {}) }, select: { id: true } });
        const ids = people.map((p) => p.id);
        await tx.notification.createMany({ data: ids.map((userId) => ({ userId, event: ev.key, text, link, important: ev.important })) });
        return ids;
      });
      if (to.length) await pushEvent(ev.key, { userIds: to, text, link });
    }
  }
}
