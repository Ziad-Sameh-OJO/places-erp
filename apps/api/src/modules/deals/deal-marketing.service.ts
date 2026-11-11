import { Injectable } from "@nestjs/common";
import type { MarketingDeal, Page, Paged } from "@places/contracts";
import type { DealType } from "@places/domain";
import { DealsRepository } from "./deals.repository";

/** On the done-deals sheet = approved by the Office Manager (M-02 2.1 step 6), collected or not. */
const ON_SHEET = ["APPROVED", "PARTIALLY_COLLECTED", "FULLY_COLLECTED"];

/**
 * M-02 2.1 step 7 · Q26 (4.9): marketing sees the approved Done Deals with only the allowed fields — location,
 * space, company, type and the Buyer. Nothing else of the deal leaves this class. (4.22: no logo any more.)
 */
@Injectable()
export class DealMarketingService {
  constructor(private readonly repo: DealsRepository) {}

  async list(f: Page): Promise<Paged<MarketingDeal>> {
    const [rows, total] = await this.repo.forMarketing(f, ON_SHEET);
    const items = rows.map((d) => ({
      id: d.id, code: d.code, buyer: d.lead?.name ?? d.company, company: d.company, type: d.type as DealType, space: d.space, location: d.location,
    }));
    return { items, total, page: f.page, pageSize: f.pageSize };
  }

  /** M-04 Company Profile: is the deal on the sheet marketing sees (a logo can only go on one of those)? */
  async onSheet(id: string): Promise<boolean> {
    return !!(await this.repo.onSheet(id, ON_SHEET));
  }

  /** The name under a deal's logo on «عملاؤنا»: the company, else the Buyer (the fields marketing may see, Q26). */
  async names(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.repo.marketingNames(ids, ON_SHEET);
    return new Map(rows.map((d) => [d.id, d.company || d.lead?.name || ""]));
  }
}
