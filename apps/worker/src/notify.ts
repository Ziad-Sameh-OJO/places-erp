/**
 * M-14: the worker's side of NotificationsService.notify() for an event's own rule — the bell and the email on the
 * rule's channels (the admin's, else the event's default), each person's email preference applied the same way
 * (channelsFor). Written in the job's transaction; the mail-outbox job sends the email, pushEvent the phone copy.
 */
import type { Prisma } from "@places/db";
import { channelsFor, eventByKey, eventChannels } from "@places/domain";

export async function tellEvent(tx: Prisma.TransactionClient, event: string, n: { userIds: readonly string[]; text: string; link: string }): Promise<void> {
  const e = eventByKey(event);
  if (!e) throw new Error(`unknown notification event ${event}`);
  const saved = await tx.notificationRule.findUnique({ where: { event }, select: { channels: true } });
  const rule = eventChannels(e, saved?.channels);
  const people = await tx.user.findMany({ where: { id: { in: [...new Set(n.userIds)] }, status: "ACTIVE" }, select: { id: true, email: true, emailNotifications: true } });
  for (const p of people) {
    const ch = channelsFor(rule, p, e.important);
    const inApp = ch.includes("app") ? await tx.notification.create({ data: { userId: p.id, event, text: n.text, link: n.link, important: e.important } }) : null;
    if (ch.includes("email")) await tx.mailLog.create({ data: { to: p.email, subject: `${e.label} · Places ERP`, text: `${n.text}\n${process.env.WEB_ORIGIN ?? ""}${n.link}`, notificationId: inApp?.id ?? null } });
  }
}
