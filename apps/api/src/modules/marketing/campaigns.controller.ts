import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { CampaignInput, CampaignUnitsQuery, DashboardQuery, NotQualifiedQuery, PageNameInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { CampaignsService } from "./campaigns.service";

/** HTTP only. M-04 4.1: marketing sees and runs the campaigns; the analytics are not for sales. */
@Controller("marketing/campaigns")
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @Requires("marketing", "view")
  list(@Me() me: CurrentUser) {
    return this.campaigns.list(me);
  }

  /** M-04 3.2 · 6.1 · 4.1: the channel → campaign dashboard is marketing's (and the management's), not sales'. */
  @Get("dashboard")
  @Requires("marketing", "view")
  dashboard(@Me() me: CurrentUser, @Query(new ZodPipe(DashboardQuery)) q: DashboardQuery) {
    return this.campaigns.dashboard(me, q);
  }

  /** 4.18 · the leads that never became Qualified and why: marketing's (and the management's), without the mobiles. */
  @Get("not-qualified")
  @Requires("marketing", "view")
  notQualified(@Query(new ZodPipe(NotQualifiedQuery)) q: NotQualifiedQuery) {
    return this.campaigns.notQualified(q);
  }

  @Get("channels")
  @Requires("marketing", "view")
  channels() {
    return this.campaigns.channels();
  }

  /** 4.20 · the unit picker: available units from the inventory sheet, and the ones this campaign already targets. */
  @Get("units")
  @Requires("marketing", "view")
  units(@Me() me: CurrentUser, @Query(new ZodPipe(CampaignUnitsQuery)) q: CampaignUnitsQuery) {
    return this.campaigns.unitOptions(me, q.campaignId);
  }

  /** 4.19 · «أسماء الصفحات»: the list the campaign's «Page name» comes from. */
  @Get("pages")
  @Requires("marketing", "view")
  pages() {
    return this.campaigns.pages();
  }

  /** «+ اسم جديد…» in the campaign form, and «إضافة» in «أسماء الصفحات». */
  @Post("pages")
  @Requires("marketing", "create")
  addPage(@Me() me: CurrentUser, @Body(new ZodPipe(PageNameInput)) body: PageNameInput) {
    return this.campaigns.addPage(me, body.name);
  }

  @Put("pages/:id")
  @HttpCode(204)
  @Requires("marketing", "edit")
  renamePage(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(PageNameInput)) body: PageNameInput) {
    return this.campaigns.renamePage(me, id, body.name);
  }

  @Delete("pages/:id")
  @HttpCode(204)
  @Requires("marketing", "edit")
  removePage(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.campaigns.removePage(me, id);
  }

  @Post()
  @Requires("marketing", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(CampaignInput)) body: CampaignInput) {
    return this.campaigns.create(me, body);
  }

  @Put(":id")
  @Requires("marketing", "edit")
  update(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(CampaignInput)) body: CampaignInput) {
    return this.campaigns.update(me, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @Requires("marketing", "delete")
  archive(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.campaigns.archive(me, id);
  }
}
