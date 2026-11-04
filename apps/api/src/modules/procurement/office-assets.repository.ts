import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

export const ASSET = { id: true, name: true, place: true, needsRepair: true } as const;
export const SHIFT = { id: true, area: true, name: true, slots: true } as const;

/** Data access only for the office assets register and the office boys' rota (10.4). */
@Injectable()
export class OfficeAssetsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /** The register as it stands: archived assets are off it. */
  assets() {
    return this.db.officeAsset.findMany({ where: { archivedAt: null }, select: ASSET, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  }

  async lastReview() {
    const r = await this.db.officeAssetReview.findFirst({ orderBy: { at: "desc" } });
    if (!r) return null;
    const by = await this.db.employee.findUnique({ where: { userId: r.reviewedById }, select: { name: true } });
    return { at: r.at, by: by?.name ?? "" };
  }

  findAsset(tx: Pick<PrismaClient, "officeAsset">, id: string) {
    return tx.officeAsset.findFirst({ where: { id, archivedAt: null }, select: ASSET });
  }

  shifts() {
    return this.db.officeBoyShift.findMany({ select: SHIFT, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  }

  findShift(tx: Pick<PrismaClient, "officeBoyShift">, id: string) {
    return tx.officeBoyShift.findUnique({ where: { id }, select: SHIFT });
  }
}

