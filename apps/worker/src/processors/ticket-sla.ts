/**
 * M-06 2.4 SLA: a ticket nobody answered in its SLA (24 working hours, 4 if high, HR Letter / List 24h, purchase 48h)
 * is escalated to its department's manager; a dispute not settled in 48 hours is told to Nancy (role officemgr).
 * Once per ticket (escalatedAt), so running twice changes nothing. The rule is isTicketLate() from @places/domain —
 * this file only applies it, with the same working calendar as lead-sla.ts.
 */
import { prisma } from "@places/db";
import { pushEvent } from "../push.ts";
import { DEPARTMENT_MANAGER_TIERS, OPEN_TICKET_STATUSES, isTicketLate, ticketType } from "@places/domain";
import { workCalendar } from "../calendar.ts";

export async function ticketSlaTick(now = new Date()): Promise<number> {
  const calendar = await workCalendar();

  const open = await prisma.ticket.findMany({ where: { status: { in: [...OPEN_TICKET_STATUSES] }, escalatedAt: null } });
  let escalated = 0;
  for (const t of open.filter((x) => isTicketLate(x, now, calendar))) {
    const type = ticketType(t.type)!;
    const dispute = type.escalateTo !== "manager";
    const to = await prisma.user.findMany({
      where: { status: "ACTIVE", ...(dispute
        ? { roles: { some: { role: { key: type.escalateTo } } } }
        : { employee: { department: t.department }, roles: { some: { role: { tier: { in: [...DEPARTMENT_MANAGER_TIERS] } } } } }) },
      select: { id: true },
    });
    const text = dispute
      ? `نزاع TK-${t.number} عدّى ${type.slaHours} ساعة من غير ما يتحسم: ${t.title}`
      : `تذكرة TK-${t.number} لقسم ${t.department} اتأخرت من غير رد · اتصعّدت ليك: ${t.title}`;
    const told = await prisma.$transaction(async (tx) => {
      // only if nobody escalated or answered it meanwhile
      const done = await tx.ticket.updateMany({ where: { id: t.id, escalatedAt: null, status: { in: [...OPEN_TICKET_STATUSES] } }, data: { escalatedAt: now } });
      if (done.count === 0) return false;
      await tx.ticketEvent.create({ data: { ticketId: t.id, kind: "escalate", byUserId: null, text: dispute ? `عدّت الـ ${type.slaHours} ساعة من غير ما يتحسم · اتبلّغت الـ Office Manager` : `اتأخرت · اتصعّدت لمدير قسم ${t.department}` } });
      await tx.auditLog.create({ data: { module: "tickets", entity: "Ticket", entityId: t.id, action: "escalate", after: { escalatedAt: now.toISOString(), to: to.map((u) => u.id) } } });
      // in-app now, the phone copy below once committed (the worker has no mail service yet)
      await tx.notification.createMany({ data: to.map((u) => ({ userId: u.id, event: "ticket.late", text, link: `/tickets?id=${t.id}`, important: true })) });
      escalated++;
      return true;
    });
    if (told) await pushEvent("ticket.late", { userIds: to.map((u) => u.id), text, link: `/tickets?id=${t.id}` });
  }
  return escalated;
}
