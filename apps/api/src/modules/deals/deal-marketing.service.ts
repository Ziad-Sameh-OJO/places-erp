import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { DealLogo, MarketingDeal, Page, Paged } from "@places/contracts";
import type { DealType } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { FilesService } from "../../core/files/files.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { DealsRepository, LOGO } from "./deals.repository";

/** On the done-deals sheet = approved by the Office Manager (M-02 2.1 step 6), collected or not. */
const ON_SHEET = ["APPROVED", "PARTIALLY_COLLECTED", "FULLY_COLLECTED"];
const NO_DEAL = "الصفقة دي مش موجودة";

/**
 * M-02 2.1 step 7 · Q26 (4.9): marketing sees the approved Done Deals with only the allowed fields — location,
 * space, company, type and the Buyer — and can attach the client's logo. Nothing else of the deal leaves this class.
 */
@Injectable()
export class DealMarketingService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: DealsRepository,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  async list(f: Page): Promise<Paged<MarketingDeal>> {
    const [rows, total] = await this.repo.forMarketing(f, ON_SHEET);
    const logos = await this.repo.logos(rows.map((r) => r.id));
    const items = rows.map((d) => ({
      id: d.id, code: d.code, buyer: d.lead?.name ?? d.company, company: d.company, type: d.type as DealType, space: d.space, location: d.location, logo: logos.get(d.id) ?? null,
    }));
    return { items, total, page: f.page, pageSize: f.pageSize };
  }

  /** The upload must be the caller's own finished one; the newest logo is the deal's. */
  async setLogo(me: CurrentUser, id: string, input: DealLogo) {
    return this.db.$transaction(async (tx) => {
      const d = await this.repo.onSheet(id, ON_SHEET, tx);
      if (!d) throw new NotFoundException(NO_DEAL);
      const before = (await this.repo.logos([id], tx)).get(id) ?? null;
      await this.files.attach(me, [input.fileId], LOGO, id, tx);
      await this.audit.record({ module: "deals", entity: "Deal", entityId: id, action: "logo", userId: me.id, before: { logo: before?.id ?? null }, after: { logo: input.fileId } }, tx);
      return (await this.repo.logos([id], tx)).get(id)!;
    });
  }

  async logoUrl(id: string) {
    if (!(await this.repo.onSheet(id, ON_SHEET))) throw new NotFoundException(NO_DEAL);
    const logo = (await this.repo.logos([id])).get(id);
    if (!logo) throw new NotFoundException("مفيش Logo على الصفقة دي");
    return this.files.downloadUrl(logo.id);
  }
}
