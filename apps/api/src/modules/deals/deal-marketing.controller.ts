import { Body, Controller, Get, Param, Put, Query } from "@nestjs/common";
import { DealLogo, Page } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { DealMarketingService } from "./deal-marketing.service";

/** HTTP only (4.9): the marketing page's «Done Deals» tab — its own permission, never the deals sheet's. */
@Controller("deals/marketing")
export class DealMarketingController {
  constructor(private readonly marketing: DealMarketingService) {}

  @Get()
  @Requires("marketing", "view")
  list(@Query(new ZodPipe(Page)) f: Page) {
    return this.marketing.list(f);
  }

  @Put(":id/logo")
  @Requires("marketing", "edit")
  setLogo(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(DealLogo)) body: DealLogo) {
    return this.marketing.setLogo(me, id, body);
  }

  @Get(":id/logo")
  @Requires("marketing", "view")
  logo(@Param("id") id: string) {
    return this.marketing.logoUrl(id);
  }
}
