import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { FILE_KINDS, type UnitPhotoView } from "@places/contracts";
import { MAX_UNIT_PHOTOS, fillsUnitFolder, photoOrder } from "@places/domain";
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

  /** Short links for these files (5 minutes), by file id; `inline` false = saved, not opened. A file storage hiccup leaves a photo out, never the list. */
  async links(fileIds: string[], inline = true): Promise<Map<string, string>> {
    const pairs = await Promise.all(fileIds.map(async (id) => [id, await this.files.downloadUrl(id, inline).then((l) => l.url, () => null)] as const));
    return new Map(pairs.filter((p): p is readonly [string, string] => p[1] !== null));
  }

  async list(me: CurrentUser, unitId: string): Promise<UnitPhotoView[]> {
    await this.visibleUnit(me, unitId);
    const photos = await this.repo.photos(unitId);
    const ids = photos.map((p) => p.fileId);
    const [files, links, saves] = await Promise.all([this.files.names(ids), this.links(ids), this.links(ids, false)]);
    const people = new Map((await this.repo.namesByUser([...new Set(files.map((f) => f.uploadedById))])).map((e) => [e.userId, e.name]));
    return photos.flatMap((p, i) => {
      const url = links.get(p.fileId), download = saves.get(p.fileId), f = files.find((n) => n.id === p.fileId);
      return url && download && f ? [{ id: p.fileId, name: f.name, url, download, main: i === 0, by: people.get(f.uploadedById) ?? null, at: f.createdAt.toISOString() }] : [];
    });
  }

  /**
   * 2.22 · the whole folder as `<code> - Pic & Info.zip`, for whoever sees the unit. The download is audited before it
   * starts; the files are read one at a time while the ZIP streams (a file storage can't read is left out).
   */
  async zip(me: CurrentUser, unitId: string): Promise<{ filename: string; entries: AsyncIterable<{ name: string; data: Buffer }> }> {
    const u = await this.visibleUnit(me, unitId);
    const ids = (await this.repo.photos(unitId)).map((p) => p.fileId);
    const files = await this.files.names(ids);
    await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "photos-zip", userId: me.id, after: { files: ids.length } });
    const safe = (x: string) => x.replace(/[\\/]/g, "_"); // a name is a name, never a path inside the ZIP
    const read = (id: string) => this.files.bytes(id);
    async function* entries() {
      const seen = new Map<string, number>();
      for (const id of ids) {
        const f = files.find((x) => x.id === id), got = f && (await read(id));
        if (!f || !got) continue;
        const n = seen.get(f.name) ?? 0;
        seen.set(f.name, n + 1);
        yield { name: `${safe(u.code)}/${safe(n ? f.name.replace(/(\.[^.]*)?$/, `-${n}$1`) : f.name)}`, data: got.body };
      }
    }
    return { filename: `${u.code} - Pic & Info.zip`, entries: entries() };
  }

  /** Your own finished uploads, images only, appended after the unit's photos. */
  async add(me: CurrentUser, unitId: string, fileIds: string[]): Promise<UnitPhotoView[]> {
    this.mayFill(me);
    await this.visibleUnit(me, unitId);
    const ids = [...new Set(fileIds)];
    const images = new Set<string>(FILE_KINDS.image.mimes);
    if ((await this.files.names(ids)).some((f) => !images.has(f.mime))) throw new BadRequestException("الصور بس (jpg / png / webp)");
    await this.db.$transaction(async (tx) => {
      const have = await this.repo.photos(unitId, tx);
      if (have.length + ids.length > MAX_UNIT_PHOTOS) throw new BadRequestException(`الوحدة ليها لحد ${MAX_UNIT_PHOTOS} صورة`);
      await this.files.attach(me, ids, "Unit", unitId, tx);
      await tx.unitPhoto.createMany({ data: ids.map((fileId, i) => ({ unitId, fileId, position: have.length + i })) });
      await this.toDraft(unitId, tx);
      // M-03 3.1 KPI (Sara): the first upload is what's measured against the time the unit was entered (2.16)
      await tx.unit.updateMany({ where: { id: unitId, mediaUploadedAt: null }, data: { mediaUploadedAt: new Date() } });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "photos-add", userId: me.id, after: { photos: ids } }, tx);
    });
    return this.list(me, unitId);
  }

  /** The new order; the first becomes the main photo. */
  async reorder(me: CurrentUser, unitId: string, fileIds: string[]): Promise<UnitPhotoView[]> {
    this.mayFill(me);
    await this.visibleUnit(me, unitId);
    await this.db.$transaction(async (tx) => {
      const have = await this.repo.photos(unitId, tx);
      const order = photoOrder(have.map((p) => p.fileId), fileIds);
      if (!order) throw new BadRequestException("الصور اتغيرت · حدّث الصفحة وجرّب تاني");
      for (const [position, fileId] of order.entries()) await tx.unitPhoto.update({ where: { fileId }, data: { position } });
      await this.toDraft(unitId, tx);
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "photos-order", userId: me.id, before: { photos: have.map((p) => p.fileId) }, after: { photos: order } }, tx);
    });
    return this.list(me, unitId);
  }

  /** Off the unit (the file record stays, with the audit trail); the ones after it move up. */
  async remove(me: CurrentUser, unitId: string, fileId: string): Promise<void> {
    this.mayFill(me);
    await this.visibleUnit(me, unitId);
    await this.db.$transaction(async (tx) => {
      const have = await this.repo.photos(unitId, tx);
      if (!have.some((p) => p.fileId === fileId)) throw new NotFoundException("الصورة مش موجودة");
      await tx.unitPhoto.delete({ where: { fileId } });
      for (const [position, p] of have.filter((x) => x.fileId !== fileId).entries()) await tx.unitPhoto.update({ where: { fileId: p.fileId }, data: { position } });
      await this.toDraft(unitId, tx);
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "photos-remove", userId: me.id, before: { photo: fileId } }, tx);
    });
  }

  /** M-03 Q19: the PDF and slide are made from the photos, so new photos (or a new order) wait for Manar's confirm again. */
  private toDraft(unitId: string, tx: Prisma.TransactionClient) {
    return tx.unit.update({ where: { id: unitId }, data: { pdfStatus: "draft" } });
  }

  /** 2.22: the folder's uploaders are the inventory's editors and the inventory team, who only have «view» in the roles. */
  private mayFill(me: CurrentUser) {
    if (!fillsUnitFolder(me.roles, me.grants)) throw new ForbiddenException("مش مسموح لك ترفع أو تمسح في فولدر الوحدة");
  }

  /** The same rule as the unit itself: archived units are gone, drafts are for the inventory team (Q15) — Sara and Marwa too, who upload them. */
  private async visibleUnit(me: CurrentUser, unitId: string) {
    const u = await this.repo.detail({ insider: fillsUnitFolder(me.roles, me.grants), staleBefore: new Date(0) }, unitId);
    if (!u) throw new NotFoundException(NO_UNIT);
    return u;
  }
}
