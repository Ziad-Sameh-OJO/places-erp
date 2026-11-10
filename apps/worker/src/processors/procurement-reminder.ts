/**
 * M-08 2.4: the approver answers a purchase request within one working day, or the approvers get a reminder — once per
 * request (remindedAt is claimed before anything is sent, so a retry or a second run sends nothing more).
 * The rule is approvalOverdue() from @places/domain; the working days and holidays come from the settings.
 * shortcut: in-app only (the worker has no mail sender yet); move it to the mail queue when that processor exists.
 */
import { prisma } from "@places/db";
import { pushEvent } from "../push.ts";
import { approvalOverdue, eventByKey } from "@places/domain";
import { workCalendar } from "../calendar.ts";

const EVENT = "procurement.reminder";

export async function procurementReminderTick(now = new Date()): Promise<number> {
  const calendar = await workCalendar();
  const pending = await prisma.purchase.findMany({ where: { status: "Pending", remindedAt: null }, select: { id: true, no: true, item: true, createdAt: true } });
  const event = eventByKey(EVENT)!;
  let sent = 0;
  for (const p of pending.filter((x) => approvalOverdue(x.createdAt, now, calendar))) {
    const text = `تذكير: طلب شراء PR-${p.no} (${p.item}) مستني موافقتك من يوم شغل`;
    const told = await prisma.$transaction(async (tx) => {
      const claimed = await tx.purchase.updateMany({ where: { id: p.id, status: "Pending", remindedAt: null }, data: { remindedAt: now } });
      if (!claimed.count) return [];
      const rule = await tx.notificationRule.findUnique({ where: { event: EVENT } });
      const people = await tx.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: [...(rule?.toRoles ?? event.toRoles)] } } } } }, select: { id: true } });
      // the in-app line only when the rule has that channel; the push below follows the rule's channels on its own
      if ((rule?.channels ?? event.channels).includes("app")) await tx.notification.createMany({ data: people.map((u) => ({ userId: u.id, event: EVENT, text, link: "/procurement", important: event.important })) });
      sent++;
      return people.map((u) => u.id);
    });
    if (told.length) await pushEvent(EVENT, { userIds: told, text, link: "/procurement" });
  }
  return sent;
}
