/**
 * 6.4 · M-11 3.3 · 6.2: an active contract whose last day has passed ends by itself, and its unit is open again in the
 * inventory — the same release as UnitsService.release (2.9): the deal's lock is dropped and, if Manar / Randa had
 * confirmed it, that side is available again. Idempotent: a contract is claimed (ACTIVE → ENDED) in its transaction.
 */
import { prisma } from "@places/db";
import { localDate, sideFor } from "@places/domain";

export async function contractExpiryTick(now = new Date()): Promise<void> {
  const today = localDate(now);
  const due = await prisma.contract.findMany({
    where: { status: "ACTIVE", endsOn: { lt: new Date(today) } },
    select: { id: true, endsOn: true, deal: { select: { id: true, unitId: true } } },
  });
  for (const c of due) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.contract.updateMany({ where: { id: c.id, status: "ACTIVE" }, data: { status: "ENDED", endedOn: c.endsOn } });
      if (!claimed.count) return;
      await tx.auditLog.create({ data: { module: "contracts", entity: "Contract", entityId: c.id, action: "ended", userId: null, before: { status: "ACTIVE" }, after: { status: "ENDED" } } });
      const lock = await tx.unitLock.findFirst({ where: { unitId: c.deal.unitId, dealId: c.deal.id } });
      if (!lock) return;
      const unit = await tx.unit.findUniqueOrThrow({ where: { id: c.deal.unitId }, select: { type: true, status: true, alsoType: true, alsoStatus: true } });
      const side = sideFor(unit, lock.type);
      await tx.unitLock.delete({ where: { id: lock.id } });
      if (lock.status === "locked" && side) await tx.unit.update({ where: { id: c.deal.unitId }, data: side === "type" ? { status: "available" } : { alsoStatus: "available" } });
      await tx.auditLog.create({ data: { module: "inventory", entity: "Unit", entityId: c.deal.unitId, action: "release", userId: null, before: { dealId: c.deal.id, type: lock.type, status: lock.status } } });
    });
  }
}
