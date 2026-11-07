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
import type { ListOfOptionsInput } from "@places/contracts";
import { type ListUnit, type Photo, deckName, listDeckHtml, listDeckPptx, listName, unitDeckHtml, unitDeckPptx } from "./unit-pdf";

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

  /**
   * 2.23 · the PDF or the slide (16:9, the client's design) as a PDF or a PowerPoint, for whoever may see the unit (a
   * draft only for the inventory team, Q15). Its photos are the Pic & Info folder's, in its order (never its PDFs).
   */
  async render(me: CurrentUser, unitId: string, kind: "pdf" | "slide", format: "pdf" | "pptx" = "pdf"): Promise<{ name: string; mime: string; body: Buffer }> {
    const { u, photos } = await this.unit(me, unitId);
    const name = deckName(u, kind);
    return format === "pptx"
      ? { name: `${name}.pptx`, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", body: await unitDeckPptx(u, photos, kind) }
      : { name: `${name}.pdf`, mime: "application/pdf", body: await this.docs.pdf(unitDeckHtml(u, photos, kind), new Date(), { slide: true }) };
  }

  /**
   * M-03 6.1 «list of options as pdf»: the picked units, in the order picked, as one file. Each unit is read the way
   * its own PDF is (`units.get`): one the person may not see (a draft for the sales, Q15) stops the whole list.
   */
  async renderList(me: CurrentUser, b: ListOfOptionsInput): Promise<{ name: string; mime: string; body: Buffer }> {
    const units: ListUnit[] = [];
    for (const id of b.unitIds) units.push(await this.unit(me, id)); // one at a time: every unit's photos are in memory
    const name = listName(units.length, b.client);
    return b.format === "pptx"
      ? { name: `${name}.pptx`, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", body: await listDeckPptx(units, b.kind, b.client) }
      : { name: `${name}.pdf`, mime: "application/pdf", body: await this.docs.pdf(listDeckHtml(units, b.kind, b.client), new Date(), { slide: true }) };
  }

  /** The unit as the person may see it, with its Pic & Info photos in order (never its PDFs). */
  private async unit(me: CurrentUser, unitId: string): Promise<ListUnit> {
    const u = await this.units.get(me, unitId);
    const ids = (await this.repo.photos(unitId)).filter((p) => !p.pdf).map((p) => p.fileId);
    // a photo storage can't give back is left out: the document still comes out
    const photos = (await Promise.all(ids.map((id) => this.files.dataUrl(id)))).filter((p): p is Photo => !!p && p.startsWith("data:image/"));
    return { u, photos };
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
