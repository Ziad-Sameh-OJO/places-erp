/**
 * M-03 3.1 · 2.18: the inventory's daily report. The reports engine (scheduled-reports.ts, 11.10) calls this at the
 * report's time («التقارير ومواعيدها», content «inventory»): it counts the day — new / updated / rented-sold /
 * unconfirmed (domain InventoryDayCounts) — saves it once per day, and tells who prepares it (Manar) that it waits for
 * her approval. Her approval sends it to the report's recipients (the API). Running twice the same day changes nothing.
 */
import { prisma } from "@places/db";
import { dayStart, staleBefore, type InventoryDayCounts } from "@places/domain";

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** The day's four numbers. «مش مؤكد» is the open units right now: a month without an update, or a PDF waiting. */
export async function inventoryDayCounts(day: string, now: Date): Promise<InventoryDayCounts> {
  const window = { gte: dayStart(day), lt: dayStart(nextDay(day)) };
  const open = { archivedAt: null, OR: [{ status: "available" as const }, { alsoType: { not: null }, alsoStatus: "available" as const }] };
  const [newUnits, updated, closed, unconfirmed] = await Promise.all([
    prisma.unit.count({ where: { archivedAt: null, enteredAt: window } }),
    prisma.unit.count({ where: { archivedAt: null, lastOwnerUpdateAt: window } }),
    prisma.unitLock.count({ where: { status: "locked", lockedAt: window } }),
    prisma.unit.count({ where: { AND: [open, { OR: [{ lastOwnerUpdateAt: { lt: staleBefore(now) } }, { pdfStatus: "draft" }] }] } }),
  ]);
  return { newUnits, updated, closed, unconfirmed };
}

/** One day's report: `approvers` are told now, `recipients` once it's approved (user ids, from the engine's names). */
export async function inventoryReportRun(r: { id: string; name: string }, day: string, now: Date, approvers: string[], recipients: string[]): Promise<void> {
  const date = new Date(`${day}T00:00:00Z`);
  if (await prisma.inventoryReport.findUnique({ where: { day: date } })) return;
  const counts = await inventoryDayCounts(day, now);
  await prisma.$transaction(async (tx) => {
    // the unique day: a second run (a retry, two workers) can't make a second report or tell anyone twice
    const made = await tx.inventoryReport.createMany({ data: [{ day: date, reportId: r.id, sendTo: recipients, ...counts }], skipDuplicates: true });
    if (made.count && approvers.length) {
      await tx.notification.createMany({ data: approvers.map((userId) => ({ userId, text: `«${r.name}» جاهز · مستني اعتمادك`, link: "/inventory?report=1" })) });
    }
  });
}
