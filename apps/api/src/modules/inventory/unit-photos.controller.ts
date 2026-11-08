import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Res } from "@nestjs/common";
import type { Response } from "express";
import { UnitAgreementInput, UnitPhotoOrder, UnitPhotosInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { writeZip } from "../../core/files/zip";
import { UnitPhotosService } from "./unit-photos.service";

/**
 * 2.4 · 2.22 · a unit's «Pic & Info» folder: whoever sees the unit opens and downloads it; adding, ordering and removing
 * is for its editors (Q18) and the inventory team — «view» lets them in, the service checks who fills the folder.
 */
@Controller("inventory/units/:id/photos")
export class UnitPhotosController {
  constructor(private readonly photos: UnitPhotosService) {}

  @Get()
  @Requires("inventory", "view")
  list(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.photos.list(me, id);
  }

  /** The whole folder as one ZIP, streamed. */
  @Get("zip")
  @Requires("inventory", "view")
  async zip(@Me() me: CurrentUser, @Param("id") id: string, @Res() res: Response) {
    const z = await this.photos.zip(me, id);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(z.filename)}`);
    await writeZip(res, z.entries);
    res.end();
  }

  @Post()
  @Requires("inventory", "view")
  add(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UnitPhotosInput)) b: UnitPhotosInput) {
    return this.photos.add(me, id, b.fileIds);
  }

  @Put("order")
  @Requires("inventory", "view")
  reorder(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UnitPhotoOrder)) b: UnitPhotoOrder) {
    return this.photos.reorder(me, id, b.fileIds);
  }

  @Delete(":fileId")
  @HttpCode(204)
  @Requires("inventory", "view")
  remove(@Me() me: CurrentUser, @Param("id") id: string, @Param("fileId") fileId: string) {
    return this.photos.remove(me, id, fileId);
  }
}

/** 2.31 · an Income unit's Agreement: opened by whoever sees the unit (a redirect to a short link), set by its editors. */
@Controller("inventory/units/:id/agreement")
export class UnitAgreementController {
  constructor(private readonly photos: UnitPhotosService) {}

  @Get()
  @Requires("inventory", "view")
  async open(@Me() me: CurrentUser, @Param("id") id: string, @Res() res: Response) {
    res.redirect(302, await this.photos.agreementUrl(me, id));
  }

  @Put()
  @HttpCode(204)
  @Requires("inventory", "edit")
  set(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UnitAgreementInput)) b: UnitAgreementInput) {
    return this.photos.setAgreement(me, id, b.fileId);
  }
}
