import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Res } from "@nestjs/common";
import type { Response } from "express";
import { CompanyProfileBaseInput, DealLogoInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { sendPdf } from "../../core/documents/documents.service";
import { CompanyProfileService } from "./company-profile.service";

/**
 * HTTP only. M-04 · Q26: only the marketing manager (Rahma: «marketing: approve») changes the Company Profile (client,
 * 11 Nov); everyone signed in gets its newest version and is told of each Update.
 */
@Controller("marketing/company-profile")
export class CompanyProfileController {
  constructor(private readonly profile: CompanyProfileService) {}

  /** Everyone: the newest version (sales send it to clients). */
  @Get()
  @SignedIn()
  latest() {
    return this.profile.latest();
  }

  @Get("admin")
  @Requires("marketing", "view")
  admin() {
    return this.profile.admin();
  }

  @Put("file")
  @Requires("marketing", "approve")
  @HttpCode(204)
  setBase(@Me() me: CurrentUser, @Body(new ZodPipe(CompanyProfileBaseInput)) body: CompanyProfileBaseInput) {
    return this.profile.setBase(me, body);
  }

  @Put("logos/:dealId")
  @Requires("marketing", "approve")
  @HttpCode(204)
  setLogo(@Me() me: CurrentUser, @Param("dealId") dealId: string, @Body(new ZodPipe(DealLogoInput)) body: DealLogoInput) {
    return this.profile.setLogo(me, dealId, body);
  }

  @Post("logos/:dealId/done")
  @Requires("marketing", "approve")
  @HttpCode(204)
  done(@Me() me: CurrentUser, @Param("dealId") dealId: string) {
    return this.profile.setDone(me, dealId, true);
  }

  @Delete("logos/:dealId/done")
  @Requires("marketing", "approve")
  @HttpCode(204)
  undone(@Me() me: CurrentUser, @Param("dealId") dealId: string) {
    return this.profile.setDone(me, dealId, false);
  }

  /** «شوف الشكل الجديد»: the PDF an Update would keep, shown in the browser; nothing saved. */
  @Get("preview")
  @Requires("marketing", "view")
  async preview(@Res() res: Response) {
    sendPdf(res, "Places Company Profile (معاينة).pdf", await this.profile.preview());
  }

  @Post("publish")
  @Requires("marketing", "approve")
  publish(@Me() me: CurrentUser) {
    return this.profile.publish(me);
  }
}
