/**
 * M-01 3.3 · 1.9: when a Visit / Meeting's time comes and nobody marked it, the salesperson who has the lead gets the
 * Alarm («دوس Done»). It fires at the visit's own time, the time the salesperson chose, so working hours don't apply.
 * Idempotent: a visit is claimed (alarmedAt) in the same transaction as its notification, so a rerun sends nothing twice;
 * «تعديل الميعاد» clears alarmedAt, so a new time gets its own Alarm.
 */
import { prisma } from "@places/db";

/** A visit older than this when the worker first sees it (it was down, or just deployed) gets no late Alarm. */
const LATE_LIMIT_MS = 24 * 60 * 60 * 1000;

export async function visitAlarmTick(now = new Date()): Promise<void> {
  const due = await prisma.leadVisit.findMany({
    where: { at: { lte: now, gte: new Date(now.getTime() - LATE_LIMIT_MS) }, outcome: null, alarmedAt: null, lead: { archivedAt: null } },
    select: { id: true, kind: true, at: true, lead: { select: { id: true, name: true, assignedToId: true } } },
  });
  if (!due.length) return;
  const owners = new Map((await prisma.employee.findMany({
    where: { id: { in: due.map((v) => v.lead.assignedToId).filter((x): x is string => !!x) }, user: { status: "ACTIVE" } },
    select: { id: true, userId: true },
  })).map((e) => [e.id, e.userId]));

  for (const v of due) {
    await prisma.$transaction(async (tx) => {
      // claimed only if still unmarked at the same time: an edit or a Done meanwhile wins
      const claimed = await tx.leadVisit.updateMany({ where: { id: v.id, at: v.at, outcome: null, alarmedAt: null }, data: { alarmedAt: now } });
      const userId = v.lead.assignedToId ? owners.get(v.lead.assignedToId) : undefined;
      if (!claimed.count || !userId) return;
      const kind = v.kind === "meeting" ? "Meeting" : "Visit";
      // demo wording; important: an Alarm stays until read (M-14)
      await tx.notification.create({ data: { userId, event: "lead.visit_due", text: `Alarm: ميعاد الـ ${kind} مع ${v.lead.name} جه · دوس Done`, link: `/leads?open=${v.lead.id}`, important: true } });
    });
  }
}
