/**
 * M-08 2.4: the approver answers a purchase request within one working day, or the approvers get a reminder — once per
 * request (remindedAt is claimed before anything is sent, so a retry or a second run sends nothing more).
 * The rule is approvalOverdue() from @places/domain; holidays come from the settings.
 * shortcut: in-app only (the worker has no mail sender yet); move it to the mail queue when that processor exists.
 */
import { prisma } from "@places/db";
import { PLACES_CALENDAR, approvalOverdue, eventByKey, holidayDays } from "@places/domain";

const EVENT = "procurement.reminder";

export async function procurementReminderTick(now = new Date()): Promise<number> {
  // official holidays are ranges «من … لحد …» (1.29)
  const holidays = holidayDays((await prisma.holiday.findMany()).map((h) => ({ from: h.from.toISOString().slice(0, 10), to: h.to.toISOString().slice(0, 10) })));
  const calendar = { ...PLACES_CALENDAR, holidays };
  const pending = await prisma.purchase.findMany({ where: { status: "Pending", remindedAt: null }, select: { id: true, no: true, item: true, createdAt: true } });
  const event = eventByKey(EVENT)!;
  let sent = 0;
  for (const p of pending.filter((x) => approvalOverdue(x.createdAt, now, calendar))) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.purchase.updateMany({ where: { id: p.id, status: "Pending", remindedAt: null }, data: { remindedAt: now } });
      if (!claimed.count) return;
      const rule = await tx.notificationRule.findUnique({ where: { event: EVENT } });
      if (!(rule?.channels ?? event.channels).includes("app")) return;
      const people = await tx.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: [...(rule?.toRoles ?? event.toRoles)] } } } } }, select: { id: true } });
      await tx.notification.createMany({ data: people.map((u) => ({ userId: u.id, event: "procurement.reminder", text: `تذكير: طلب شراء PR-${p.no} (${p.item}) مستني موافقتك من يوم شغل`, link: "/procurement", important: event.important })) });
      sent++;
    });
  }
  return sent;
}
