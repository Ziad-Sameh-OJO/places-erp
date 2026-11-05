import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CampaignInput } from "@places/contracts";
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
  list() {
    return this.campaigns.list();
  }

  @Get("channels")
  @Requires("marketing", "view")
  channels() {
    return this.campaigns.channels();
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
