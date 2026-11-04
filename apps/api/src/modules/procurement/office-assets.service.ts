import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { OfficeAssetInput, OfficeAssetsRegister, OfficeAssetView, OfficeBoyShiftInput, OfficeBoyShiftView } from "@places/contracts";
import { assetsReviewedThisMonth } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ASSET, OfficeAssetsRepository, SHIFT } from "./office-assets.repository";

const NO_ASSET = "الأصل ده مش موجود في السجل";
const NO_SHIFT = "الصف ده مش موجود في الجدول";
const MODULE = "procurement";

/**
 * M-08 3.1 · Mokhtar's office assets register (updated and reviewed every month) and the office boys' rota by area
 * (Nancy rates the compliance on his KPI card, M-12). Every change is audited in its own transaction (Q50).
 */
@Injectable()
export class OfficeAssetsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly repo: OfficeAssetsRepository, private readonly audit: AuditService) {}

  async register(now = new Date()): Promise<OfficeAssetsRegister> {
    const [items, last] = await Promise.all([this.repo.assets(), this.repo.lastReview()]);
    return {
      items,
      lastReview: last && { at: last.at.toISOString(), by: last.by },
      reviewedThisMonth: assetsReviewedThisMonth(last?.at ?? null, now),
    };
  }

  addAsset(me: CurrentUser, input: OfficeAssetInput): Promise<OfficeAssetView> {
    return this.db.$transaction(async (tx) => {
      const asset = await tx.officeAsset.create({ data: input, select: ASSET });
      await this.audit.record({ module: MODULE, entity: "OfficeAsset", entityId: asset.id, action: "create", userId: me.id, after: input }, tx);
      return asset;
    });
  }

  updateAsset(me: CurrentUser, id: string, input: OfficeAssetInput): Promise<OfficeAssetView> {
    return this.db.$transaction(async (tx) => {
      const before = await this.repo.findAsset(tx, id);
      if (!before) throw new NotFoundException(NO_ASSET);
      const asset = await tx.officeAsset.update({ where: { id }, data: input, select: ASSET });
      await this.audit.record({ module: MODULE, entity: "OfficeAsset", entityId: id, action: "update", userId: me.id, before, after: input }, tx);
      return asset;
    });
  }

  /** Off the register (sold, thrown away): archived, so the trail stays. */
  async archiveAsset(me: CurrentUser, id: string) {
    await this.db.$transaction(async (tx) => {
      const before = await this.repo.findAsset(tx, id);
      if (!before) throw new NotFoundException(NO_ASSET);
      await tx.officeAsset.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.record({ module: MODULE, entity: "OfficeAsset", entityId: id, action: "delete", userId: me.id, before }, tx);
    });
  }

  /** «اتراجع الشهر ده»: the monthly review the KPI asks for. Reviewing twice in a month just records the later one. */
  markReviewed(me: CurrentUser) {
    return this.db.$transaction(async (tx) => {
      const review = await tx.officeAssetReview.create({ data: { reviewedById: me.id } });
      await this.audit.record({ module: MODULE, entity: "OfficeAssetReview", entityId: review.id, action: "create", userId: me.id, after: { at: review.at } }, tx);
      return { id: review.id, at: review.at.toISOString(), by: me.name };
    });
  }

  shifts(): Promise<OfficeBoyShiftView[]> {
    return this.repo.shifts();
  }

  addShift(me: CurrentUser, input: OfficeBoyShiftInput): Promise<OfficeBoyShiftView> {
    return this.db.$transaction(async (tx) => {
      const shift = await tx.officeBoyShift.create({ data: input, select: SHIFT });
      await this.audit.record({ module: MODULE, entity: "OfficeBoyShift", entityId: shift.id, action: "create", userId: me.id, after: input }, tx);
      return shift;
    });
  }

  updateShift(me: CurrentUser, id: string, input: OfficeBoyShiftInput): Promise<OfficeBoyShiftView> {
    return this.db.$transaction(async (tx) => {
      const before = await this.repo.findShift(tx, id);
      if (!before) throw new NotFoundException(NO_SHIFT);
      const shift = await tx.officeBoyShift.update({ where: { id }, data: input, select: SHIFT });
      await this.audit.record({ module: MODULE, entity: "OfficeBoyShift", entityId: id, action: "update", userId: me.id, before, after: input }, tx);
      return shift;
    });
  }

  async removeShift(me: CurrentUser, id: string) {
    await this.db.$transaction(async (tx) => {
      const before = await this.repo.findShift(tx, id);
      if (!before) throw new NotFoundException(NO_SHIFT);
      await tx.officeBoyShift.delete({ where: { id } });
      await this.audit.record({ module: MODULE, entity: "OfficeBoyShift", entityId: id, action: "delete", userId: me.id, before }, tx);
    });
  }
}
