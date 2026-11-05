import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { UnitLockView } from "@places/contracts";
import { type UnitSide, type UnitType, closeConfirmer, closedStatus, confirmsClose, sideFor, sideOpen } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryRepository } from "./inventory.repository";

type Tx = Prisma.TransactionClient;
const NO_UNIT = "الوحدة مش موجودة";
const WHO = { inventory: "منار", resale: "رندا" } as const;

/**
 * M-03 Q16 · Q17 · closing a unit after a Done Deal. The deals (5.5) and the contracts (6.4) call `lock` and `release`
 * from their services — never this module's tables. A lock is on one side of the unit (the deal's type): it waits for
 * Manar (Rent) or Randa (Resale / Income) to confirm, then that side is rented / sold and the other side stays open.
 */
@Injectable()
export class UnitsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: InventoryRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * A Done Deal was approved on this unit: ask Manar / Randa to confirm the close. `type` is the deal's type (the side
   * it closes). Pass the caller's transaction so the deal and the request are saved together; calling it again for
   * the same deal changes nothing. Refused when the unit isn't open on that side or another deal is already on it.
   */
  async lock(unitId: string, dealId: string, by: { type: UnitType; userId: string }, tx?: Tx): Promise<{ status: "pending" | "locked" }> {
    const work = async (t: Tx) => {
      const u = await this.repo.sides(unitId, t);
      if (!u) throw new NotFoundException(NO_UNIT);
      const mine = await this.repo.lockOf(unitId, dealId, t);
      if (mine) return { unit: u, lock: mine, fresh: false };
      const side = sideFor(u, by.type);
      if (!side) throw new BadRequestException(`${u.code} مش متاحة ${by.type}`);
      if (!sideOpen(u, side)) throw new BadRequestException(`الـ ${by.type} في ${u.code} اتقفل قبل كده`);
      const lock = await t.unitLock.create({ data: { unitId, dealId, type: by.type, requestedById: by.userId } }).catch((e: unknown) => {
        // one Done Deal per side at a time (unique unitId + type)
        if ((e as { code?: unknown } | null)?.code === "P2002") throw new ConflictException(`${u.code} عليها Done Deal تانية مستنية تأكيد القفل`);
        throw e;
      });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "close-request", userId: by.userId, after: { dealId, type: by.type } }, t);
      return { unit: u, lock, fresh: true };
    };
    const { unit, lock, fresh } = tx ? await work(tx) : await this.db.$transaction(work);
    if (fresh) {
      const role = closeConfirmer(lock.type);
      await this.notifications.notify({
        event: "unit.close", to: [role], link: `/inventory?unit=${unit.id}`,
        text: `Done Deal على ${unit.code} (${unit.project}) اتوافق عليها · أكّد قفل الوحدة (${closedStatus(lock.type) === "sold" ? "Sold" : "Rented"})`,
      });
    }
    return { status: lock.status === "locked" ? "locked" : "pending" };
  }

  /**
   * The deal was cancelled, or its contract ended early or ran out (6.4): the request is dropped, and if the side was
   * already closed it is open again. Nothing happens when this deal has no lock on the unit.
   */
  async release(unitId: string, dealId: string, by: { userId: string }, tx?: Tx): Promise<void> {
    const work = async (t: Tx) => {
      const lock = await this.repo.lockOf(unitId, dealId, t);
      if (!lock) return;
      const u = await t.unit.findUniqueOrThrow({ where: { id: unitId }, select: { type: true, status: true, alsoType: true, alsoStatus: true } });
      const side = sideFor(u, lock.type);
      await t.unitLock.delete({ where: { id: lock.id } });
      if (lock.status === "locked" && side) await t.unit.update({ where: { id: unitId }, data: sideStatus(side, "available") });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "release", userId: by.userId, before: { dealId, type: lock.type, status: lock.status } }, t);
    };
    if (tx) await work(tx);
    else await this.db.$transaction(work);
  }

  /** Q16: Manar (Rent) or Randa (Resale / Income) confirms: that side is rented / sold, the other side stays open (Q17). */
  async confirm(me: CurrentUser, unitId: string, dealId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const lock = await this.repo.lockOf(unitId, dealId, tx);
      if (!lock) throw new NotFoundException("مفيش Done Deal على الوحدة دي");
      if (!confirmsClose(me.roles, lock.type)) throw new ForbiddenException(`تأكيد قفل الـ ${lock.type} بتاع ${WHO[closeConfirmer(lock.type)]}`);
      if (lock.status === "locked") throw new BadRequestException("القفل اتأكد قبل كده");
      const u = await this.repo.sides(unitId, tx);
      if (!u) throw new NotFoundException(NO_UNIT);
      const side = sideFor(u, lock.type);
      // the type was edited off the unit since the deal: Manar / Randa put it back first (Q17: only they change it)
      if (!side || !sideOpen(u, side)) throw new BadRequestException(`${u.code} مش متاحة ${lock.type} دلوقتي`);
      const status = closedStatus(lock.type);
      await tx.unitLock.update({ where: { id: lock.id }, data: { status: "locked", lockedAt: new Date(), lockedById: me.id } });
      await tx.unit.update({ where: { id: unitId }, data: sideStatus(side, status) });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "close", userId: me.id, before: { [side === "type" ? "status" : "alsoStatus"]: "available" }, after: { dealId, type: lock.type, status } }, tx);
    });
  }

  /** The Done Deals on a unit for its drawer, with whether this person is the one who confirms each. */
  async locks(me: CurrentUser, unitId: string): Promise<UnitLockView[]> {
    return (await this.repo.locks(unitId)).map((l) => ({
      dealId: l.dealId, dealCode: l.deal.code, type: l.type, status: l.status === "locked" ? "locked" : "pending",
      requestedAt: l.requestedAt.toISOString(), lockedAt: l.lockedAt?.toISOString() ?? null,
      canConfirm: l.status === "pending" && confirmsClose(me.roles, l.type),
    }));
  }

  /**
   * A side with a Done Deal on it can't be taken off the unit or swapped by an edit (Q17): the deal is released first.
   * Returns the problem in Arabic, or null.
   */
  async editBlocked(unitId: string, keeps: { type: UnitType; alsoType: UnitType | null }): Promise<string | null> {
    const held = (await this.repo.locks(unitId)).find((l) => l.type !== keeps.type && l.type !== keeps.alsoType);
    return held ? `الـ ${held.type} عليه Done Deal ${held.deal.code} · مينفعش يتشال من الوحدة` : null;
  }
}

const sideStatus = (side: UnitSide, status: "available" | "rented" | "sold") => (side === "type" ? { status } : { alsoStatus: status });
