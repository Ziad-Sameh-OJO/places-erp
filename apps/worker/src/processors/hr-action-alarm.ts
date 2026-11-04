/**
 * M-05 7.8: «حل الـ HR» from a 1-to-1 rings on its due day, once (actionAlarm in @places/domain), until it's marked done.
 */
import { prisma } from "@places/db";
import { actionAlarm, eventByKey, localDate } from "@places/domain";

export async function hrActionAlarmTick(): Promise<void> {
  const today = localDate(new Date());
  const rows = await prisma.oneOnOne.findMany({ where: { hrAction: { not: null }, hrActionDone: false, alarmedAt: null, hrActionDue: { lte: new Date(`${today}T00:00:00Z`) } }, include: { employee: { select: { name: true } } } });
  if (!rows.length) return;
  const ev = eventByKey("hr.action_due")!;
  const roles = (await prisma.notificationRule.findUnique({ where: { event: ev.key } }))?.toRoles ?? [...ev.toRoles];
  const to = (await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: roles } } } } }, select: { id: true } })).map((u) => u.id);
  for (const r of rows) {
    if (!actionAlarm(r.hrActionDue!.toISOString().slice(0, 10), today, r.hrActionDone, !!r.alarmedAt)) continue;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.oneOnOne.updateMany({ where: { id: r.id, alarmedAt: null }, data: { alarmedAt: new Date() } });
      if (!claimed.count) return;
      await tx.notification.createMany({ data: to.map((userId) => ({ userId, text: `ميعاد حل الـ HR مع ${r.employee.name}: ${r.hrAction}`, link: "/hr", important: true })) });
    });
  }
}
