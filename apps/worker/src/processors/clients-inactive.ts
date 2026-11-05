/**
 * M-10 3.3: «Inactive · مفيش تعامل من سنة · السيستم». Once a day, on a working day (Friday and official holidays
 * skipped, like the other daily jobs), every Active file with no contact, deal or unit update for a year goes Inactive
 * (inactiveBefore in @places/domain), audited in the same transaction. Idempotent: only Active files are touched, so a
 * second run finds nothing. Dealing with them again (a contact, a deal) makes them Active (ClientsService).
 */
import { prisma } from "@places/db";
import { PLACES_CALENDAR, holidayDays, inactiveBefore, isWorkingDay, localDate } from "@places/domain";

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function clientsInactiveTick(now = new Date()): Promise<number> {
  const holidays = holidayDays((await prisma.holiday.findMany()).map((h) => ({ from: day(h.from), to: day(h.to) })));
  if (!isWorkingDay(localDate(now), { ...PLACES_CALENDAR, holidays })) return 0;
  const cutoff = inactiveBefore(now);
  const stale = await prisma.client.findMany({ where: { status: "active", archivedAt: null, lastContactAt: { lt: cutoff } }, select: { id: true, lastContactAt: true } });
  let moved = 0;
  for (const c of stale) {
    await prisma.$transaction(async (tx) => {
      // claimed: a run at the same time, or a contact logged meanwhile, leaves it alone
      const claimed = await tx.client.updateMany({ where: { id: c.id, status: "active", lastContactAt: { lt: cutoff } }, data: { status: "inactive" } });
      if (!claimed.count) return;
      moved++;
      await tx.auditLog.create({ data: { module: "clients", entity: "Client", entityId: c.id, action: "inactive",
        before: { status: "active", lastContactAt: c.lastContactAt.toISOString() }, after: { status: "inactive" } } });
    });
  }
  return moved;
}
