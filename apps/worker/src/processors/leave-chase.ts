/**
 * M-05 7.5: a leave request still at the Team Leader — a reminder to him after 24 hours, an escalation to HR and
 * management after 48. leaveChase() from @places/domain decides; each step is stamped so it happens once.
 */
import { prisma } from "@places/db";
import { pushEvent } from "../push.ts";
import { eventByKey, leaveChase } from "@places/domain";

export async function leaveChaseTick(): Promise<void> {
  const now = new Date();
  const pending = await prisma.leaveRequest.findMany({ where: { status: "PENDING_TL", escalatedAt: null }, include: { employee: { select: { name: true } } } });
  const esc = eventByKey("hr.leave_escalated")!;
  for (const r of pending) {
    const step = leaveChase(r.createdAt, now, { reminded: !!r.remindedAt, escalated: !!r.escalatedAt });
    if (!step) continue;
    const text = step === "remind" ? `طلب إجازة ${r.employee.name} مستني ردك من 24 ساعة` : `طلب إجازة ${r.employee.name} عدّى 48 ساعة من غير رد من الـ Team Leader`;
    const to = step === "remind" ? (r.tlUserId ? [r.tlUserId] : [])
      : (await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: (await prisma.notificationRule.findUnique({ where: { event: esc.key } }))?.toRoles ?? [...esc.toRoles] } } } } }, select: { id: true } })).map((u) => u.id);
    const event = step === "escalate" ? "hr.leave_escalated" : "hr.leave_request";
    const told = await prisma.$transaction(async (tx) => {
      const claimed = await tx.leaveRequest.updateMany({ where: { id: r.id, ...(step === "remind" ? { remindedAt: null } : { escalatedAt: null }) }, data: step === "remind" ? { remindedAt: now } : { escalatedAt: now } });
      if (!claimed.count || !to.length) return false;
      await tx.notification.createMany({ data: to.map((userId) => ({ userId, event, text, link: "/hr", important: step === "escalate" })) });
      return true;
    });
    if (told) await pushEvent(event, { userIds: to, text, link: "/hr" });
  }
}
