import { Controller, Get, Query } from "@nestjs/common";
import { Page } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { DealMarketingService } from "./deal-marketing.service";

/**
 * HTTP only (4.9): the marketing page's «Done Deals» tab — its own permission, never the deals sheet's. Attaching a logo
 * is gone (4.22, demo 9 Nov); the logos uploaded before stay in the database.
 */
@Controller("deals/marketing")
export class DealMarketingController {
  constructor(private readonly marketing: DealMarketingService) {}

  @Get()
  @Requires("marketing", "view")
  list(@Query(new ZodPipe(Page)) f: Page) {
    return this.marketing.list(f);
  }
}
