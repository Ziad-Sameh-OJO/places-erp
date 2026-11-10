import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { fileKind, type UnitLayoutView } from "@places/contracts";
import { fillsUnitFolder } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { FilesService } from "../../core/files/files.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryRepository } from "./inventory.repository";
import { UnitPhotosService } from "./unit-photos.service";

const NOT_HERE = "الملف مش موجود في فولدر الـ Layout";

/**
 * 2.35 · a unit's «Layout file» folder (PDF · DWG · images) instead of Layout Yes / No: the unit has a Layout when the
 * folder has files. Same people as the «Pic & Info» folder (2.22): whoever sees the unit opens and downloads; the
 * inventory's editors and team add, replace and remove. Never read by the PDF or the slide (they take the photos only).
 * M-09: a role the Layout field is hidden for doesn't get the folder; read only = sees it, can't change it.
 */
@Injectable()
export class UnitLayoutsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: InventoryRepository,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly photos: UnitPhotosService,
  ) {}

  async list(me: CurrentUser, unitId: string): Promise<UnitLayoutView[]> {
    await this.visibleUnit(me, unitId);
    const ids = (await this.repo.layouts(unitId)).map((l) => l.fileId);
    const [files, links, saves] = await Promise.all([this.files.names(ids), this.photos.links(ids), this.photos.links(ids, false)]);
    const people = new Map((await this.repo.namesByUser([...new Set(files.map((f) => f.uploadedById))])).map((e) => [e.userId, e.name]));
    return ids.flatMap((id) => {
      const url = links.get(id), download = saves.get(id), f = files.find((n) => n.id === id), kind = f && fileKind(f.mime);
      return url && download && f && kind && kind !== "video" ? [{ id, name: f.name, kind: kind, url, download, by: people.get(f.uploadedById) ?? null, at: f.createdAt.toISOString() }] : [];
    });
  }

  /** `<code> - Layout.zip`, audited before it starts. */
  async zip(me: CurrentUser, unitId: string) {
    const u = await this.visibleUnit(me, unitId);
    const ids = (await this.repo.layouts(unitId)).map((l) => l.fileId);
    await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "layout-zip", userId: me.id, after: { files: ids.length } });
    return { filename: `${u.code} - Layout.zip`, entries: await this.photos.zipEntries(u.code, ids) };
  }

  /** Your own finished uploads (PDF · DWG / DXF · images), appended to the folder. */
  async add(me: CurrentUser, unitId: string, fileIds: string[]): Promise<UnitLayoutView[]> {
    this.mayFill(me);
    await this.visibleUnit(me, unitId);
    const ids = [...new Set(fileIds)];
    await this.checkTypes(ids);
    await this.db.$transaction(async (tx) => {
      await this.files.attach(me, ids, "Unit", unitId, tx);
      await tx.unitLayout.createMany({ data: ids.map((fileId) => ({ unitId, fileId })) });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "layout-add", userId: me.id, after: { layout: ids } }, tx);
    });
    return this.list(me, unitId);
  }

  /** The new version takes the old one's place in the folder; both are in the audit (the old file record stays). */
  async replace(me: CurrentUser, unitId: string, oldId: string, newId: string): Promise<UnitLayoutView[]> {
    this.mayFill(me);
    await this.visibleUnit(me, unitId);
    await this.checkTypes([newId]);
    await this.db.$transaction(async (tx) => {
      if (!(await this.repo.layouts(unitId, tx)).some((l) => l.fileId === oldId)) throw new NotFoundException(NOT_HERE);
      await this.files.attach(me, [newId], "Unit", unitId, tx);
      await tx.unitLayout.update({ where: { fileId: oldId }, data: { fileId: newId } });
      const names = new Map((await this.files.names([oldId, newId])).map((f) => [f.id, f.name]));
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "layout-replace", userId: me.id,
        before: { fileId: oldId, name: names.get(oldId) }, after: { fileId: newId, name: names.get(newId) } }, tx);
    });
    return this.list(me, unitId);
  }

  /** Off the folder (the file record stays, with the audit trail). */
  async remove(me: CurrentUser, unitId: string, fileId: string): Promise<void> {
    this.mayFill(me);
    await this.visibleUnit(me, unitId);
    await this.db.$transaction(async (tx) => {
      if (!(await this.repo.layouts(unitId, tx)).some((l) => l.fileId === fileId)) throw new NotFoundException(NOT_HERE);
      await tx.unitLayout.delete({ where: { fileId } });
      const [f] = await this.files.names([fileId]);
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "layout-remove", userId: me.id, before: { fileId, name: f?.name } }, tx);
    });
  }

  private async checkTypes(ids: string[]) {
    if ((await this.files.names(ids)).some((f) => !fileKind(f.mime))) throw new BadRequestException("صور أو PDF أو DWG / DXF بس");
  }

  private mayFill(me: CurrentUser) {
    if (!fillsUnitFolder(me.roles, me.grants) || me.fields.fixed("inventory").has("layout")) throw new ForbiddenException("مش مسموح لك ترفع أو تمسح في فولدر الوحدة");
  }

  private async visibleUnit(me: CurrentUser, unitId: string) {
    if (me.fields.hidden("inventory").has("layout")) throw new ForbiddenException("مش مسموح لك تشوف الـ Layout");
    const u = await this.repo.detail({ insider: fillsUnitFolder(me.roles, me.grants), staleBefore: new Date(0) }, unitId);
    if (!u) throw new NotFoundException("الوحدة مش موجودة");
    return u;
  }
}
