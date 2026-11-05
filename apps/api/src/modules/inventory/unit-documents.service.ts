import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { keepsInventory } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { DocumentsService } from "../../core/documents/documents.service";
import { FilesService } from "../../core/files/files.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryRepository } from "./inventory.repository";
import { InventoryService } from "./inventory.service";
import { type Photo, unitSheet, unitSlide } from "./unit-pdf";

/** The photos that go in the A4 sheet: the main one large, a few more under it. */
const SHEET_PHOTOS = 5;

/**
 * 2.8 · M-03 2.2 (15) · (19): the unit's PDF and slide are made by the system from its current sheet and photos — so
 * they are always the latest, and nobody can change them by hand. Manar confirms; only then does the unit reach the
 * sales (Q15). Any edit of the data or the photos sends it back to her (the unit service and the photos service).
 */
@Injectable()
export class UnitDocumentsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: InventoryRepository,
    private readonly units: InventoryService,
    private readonly docs: DocumentsService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The PDF (A4) or the slide, for whoever may see the unit (a draft only for the inventory team, Q15). */
  async render(me: CurrentUser, unitId: string, kind: "pdf" | "slide"): Promise<{ name: string; body: Buffer }> {
    const u = await this.units.get(me, unitId);
    const ids = (await this.repo.photos(unitId)).filter((p) => !p.pdf).map((p) => p.fileId).slice(0, kind === "slide" ? 1 : SHEET_PHOTOS);
    // a photo storage can't give back is left out: the document still comes out
    const photos = (await Promise.all(ids.map((id) => this.files.dataUrl(id)))).filter((p): p is Photo => !!p && p.startsWith("data:image/"));
    const html = kind === "slide" ? unitSlide(u, photos[0] ?? null) : unitSheet(u, photos);
    return { name: `${u.code}${kind === "slide" ? " slide" : ""}.pdf`, body: await this.docs.pdf(html, new Date(), { slide: kind === "slide" }) };
  }

  /** Q15: Manar's confirm publishes the unit to the sales; marketing and sales hear of it (the demo's pdfConfirm). */
  async confirm(me: CurrentUser, unitId: string): Promise<void> {
    const u = await this.db.$transaction(async (tx) => {
      const unit = await this.repo.detail({ insider: keepsInventory(me.grants), staleBefore: new Date(0) }, unitId, tx);
      if (!unit) throw new NotFoundException("الوحدة مش موجودة");
      if (unit.pdfStatus === "confirmed") throw new BadRequestException("الـ PDF ده اتعمله Confirm قبل كده");
      await tx.unit.update({ where: { id: unitId }, data: { pdfStatus: "confirmed" } });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: unitId, action: "pdf-confirm", userId: me.id, before: { pdfStatus: "draft" }, after: { pdfStatus: "confirmed" } }, tx);
      return unit;
    });
    await this.notifications.notify({ event: "unit.published", link: `/inventory?unit=${u.id}`, text: `الوحدة ${u.code} (${u.project}) اتنشرت · جاهزة للسيلز والحملات` });
  }
}
