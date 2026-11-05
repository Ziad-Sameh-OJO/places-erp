import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { FILE_KINDS, type UnitPhotoView } from "@places/contracts";
import { MAX_UNIT_PHOTOS, keepsInventory, photoOrder } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { FilesService } from "../../core/files/files.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryRepository } from "./inventory.repository";

const NO_UNIT = "الوحدة مش موجودة";

/**
 * 2.4 · a unit's photos (M-03 1.2: on the unit's page in the system instead of the Drive). The files go up through
 * core/files; here they're tied to the unit, ordered (the first is the main photo), and removed — by the people who
 * edit the inventory only. Whoever may see the unit sees its photos.
 */
@Injectable()
export class UnitPhotosService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: InventoryRepository,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  /** Short links for these files (5 minutes), by file id. A file storage hiccup leaves a photo out, never the list. */
  async links(fileIds: string[]): Promise<Map<string, string>> {
    const pairs = await Promise.all(fileIds.map(async (id) => [id, await this.files.downloadUrl(id).then((l) => l.url, () => null)] as const));
    return new Map(pairs.filter((p): p is readonly [string, string] => p[1] !== null));
  }

  async list(me: CurrentUser, unitId: string): Promise<UnitPhotoView[]> {
    await this.visibleUnit(me, unitId);
    const photos = await this.repo.photos(unitId);
    const ids = photos.map((p) => p.fileId);
    const [names, links] = await Promise.all([this.files.names(ids), this.links(ids)]);
    return photos.flatMap((p, i) => {
      const url = links.get(p.fileId);
      return url ? [{ id: p.fileId, name: names.find((n) => n.id === p.fileId)?.name ?? "", url, main: i === 0 }] : [];
    });
  }

  /** Your own finished uploads, images only, appended after the unit's photos. */
  async add(me: CurrentUser, unitId: string, fileIds: string[]): Promise<UnitPhotoView[]> {
    await this.visibleUnit(me, unitId);
    const ids = [...new Set(fileIds)];
    const images = new Set<string>(FILE_KINDS.image.mimes);
    if ((await this.files.names(ids)).some((f) => !images.has(f.mime))) throw new BadRequestException("الصور بس (jpg / png / webp)");
    await this.db.$transaction(async (tx) => {
      const have = await this.repo.photos(unitId, tx);
      if (have.length + ids.length > MAX_UNIT_PHOTOS) throw new BadRequestException(`الوحدة ليها لحد ${MAX_UNIT_PHOTOS} صورة`);
      await this.files.attach(me, ids, "Unit", unitId, tx);
      await tx.unitPhoto.createMany({ data: ids.map((fileId, i) => ({ unitId, fileId, position: have.length + i })) });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "photos-add", userId: me.id, after: { photos: ids } }, tx);
    });
    return this.list(me, unitId);
  }

  /** The new order; the first becomes the main photo. */
  async reorder(me: CurrentUser, unitId: string, fileIds: string[]): Promise<UnitPhotoView[]> {
    await this.visibleUnit(me, unitId);
    await this.db.$transaction(async (tx) => {
      const have = await this.repo.photos(unitId, tx);
      const order = photoOrder(have.map((p) => p.fileId), fileIds);
      if (!order) throw new BadRequestException("الصور اتغيرت · حدّث الصفحة وجرّب تاني");
      for (const [position, fileId] of order.entries()) await tx.unitPhoto.update({ where: { fileId }, data: { position } });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "photos-order", userId: me.id, before: { photos: have.map((p) => p.fileId) }, after: { photos: order } }, tx);
    });
    return this.list(me, unitId);
  }

  /** Off the unit (the file record stays, with the audit trail); the ones after it move up. */
  async remove(me: CurrentUser, unitId: string, fileId: string): Promise<void> {
    await this.visibleUnit(me, unitId);
    await this.db.$transaction(async (tx) => {
      const have = await this.repo.photos(unitId, tx);
      if (!have.some((p) => p.fileId === fileId)) throw new NotFoundException("الصورة مش موجودة");
      await tx.unitPhoto.delete({ where: { fileId } });
      for (const [position, p] of have.filter((x) => x.fileId !== fileId).entries()) await tx.unitPhoto.update({ where: { fileId: p.fileId }, data: { position } });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "photos-remove", userId: me.id, before: { photo: fileId } }, tx);
    });
  }

  /** The same rule as the unit itself: archived units are gone, drafts are for the inventory team (Q15). */
  private async visibleUnit(me: CurrentUser, unitId: string) {
    const u = await this.repo.detail({ insider: keepsInventory(me.grants), staleBefore: new Date(0) }, unitId);
    if (!u) throw new NotFoundException(NO_UNIT);
    return u;
  }
}
