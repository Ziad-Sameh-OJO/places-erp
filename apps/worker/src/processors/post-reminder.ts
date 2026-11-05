/**
 * M-04 2.4 · 7.1: «كل بوست له ميعاد نشر … وبيوصل Reminder في الميعاد» — at the post's own time (it is the time
 * Rahma chose, so it isn't moved to working hours), to whoever planned it and marketing (rule marketing.post_reminder).
 * Once per post (reminderSentAt), so running twice changes nothing. The rule is reminderDue() from @places/domain.
 */
import { prisma } from "@places/db";
import { eventByKey, reminderDue } from "@places/domain";

export async function postReminderTick(now = new Date()): Promise<number> {
  const due = (await prisma.post.findMany({ where: { archivedAt: null, approved: true, publishedAt: null, reminderSentAt: null, at: { lte: now } } }))
    .filter((p) => reminderDue(p, now));
  if (!due.length) return 0;
  const roles = eventByKey("marketing.post_reminder")!.toRoles;
  const saved = await prisma.notificationRule.findUnique({ where: { event: "marketing.post_reminder" } });
  const marketing = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: saved?.toRoles ?? [...roles] } } } } }, select: { id: true } });
  let sent = 0;
  for (const p of due) {
    const to = [...new Set([p.createdById, ...marketing.map((u) => u.id)])];
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.post.updateMany({ where: { id: p.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (claimed.count === 0) return;
      // in-app only, like the other jobs: the worker has no mail service yet
      await tx.notification.createMany({ data: to.map((userId) => ({ userId, text: `Reminder: ميعاد بوست «${p.title}» على ${p.channel} دلوقتي`, link: "/marketing?tab=content", important: false })) });
      sent++;
    });
  }
  return sent;
}
