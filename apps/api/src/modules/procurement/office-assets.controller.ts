import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { OfficeAssetInput, OfficeBoyShiftInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { OfficeAssetsService } from "./office-assets.service";

/**
 * HTTP only. Everyone who sees procurement (the approvers, Nancy, the accountant) sees the register and the rota;
 * Mokhtar (procurement edit) and the admins keep them (M-08 3.1: «مين يكتبها: مختار»).
 */
@Controller("procurement")
export class OfficeAssetsController {
  constructor(private readonly office: OfficeAssetsService) {}

  @Get("office-assets")
  @Requires("procurement", "view")
  register() {
    return this.office.register();
  }

  @Post("office-assets")
  @Requires("procurement", "edit")
  addAsset(@Me() me: CurrentUser, @Body(new ZodPipe(OfficeAssetInput)) body: OfficeAssetInput) {
    return this.office.addAsset(me, body);
  }

  @Post("office-assets/review")
  @HttpCode(201)
  @Requires("procurement", "edit")
  markReviewed(@Me() me: CurrentUser) {
    return this.office.markReviewed(me);
  }

  @Patch("office-assets/:id")
  @Requires("procurement", "edit")
  updateAsset(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(OfficeAssetInput)) body: OfficeAssetInput) {
    return this.office.updateAsset(me, id, body);
  }

  @Delete("office-assets/:id")
  @HttpCode(204)
  @Requires("procurement", "edit")
  archiveAsset(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.office.archiveAsset(me, id);
  }

  @Get("office-boys")
  @Requires("procurement", "view")
  shifts() {
    return this.office.shifts();
  }

  @Post("office-boys")
  @Requires("procurement", "edit")
  addShift(@Me() me: CurrentUser, @Body(new ZodPipe(OfficeBoyShiftInput)) body: OfficeBoyShiftInput) {
    return this.office.addShift(me, body);
  }

  @Patch("office-boys/:id")
  @Requires("procurement", "edit")
  updateShift(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(OfficeBoyShiftInput)) body: OfficeBoyShiftInput) {
    return this.office.updateShift(me, id, body);
  }

  @Delete("office-boys/:id")
  @HttpCode(204)
  @Requires("procurement", "edit")
  removeShift(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.office.removeShift(me, id);
  }
}
