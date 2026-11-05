import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { UnitPhotoOrder, UnitPhotosInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { UnitPhotosService } from "./unit-photos.service";

/** 2.4 · a unit's photos: whoever sees the unit sees them; adding, ordering and removing is for its editors (Q18). */
@Controller("inventory/units/:id/photos")
export class UnitPhotosController {
  constructor(private readonly photos: UnitPhotosService) {}

  @Get()
  @Requires("inventory", "view")
  list(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.photos.list(me, id);
  }

  @Post()
  @Requires("inventory", "edit")
  add(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UnitPhotosInput)) b: UnitPhotosInput) {
    return this.photos.add(me, id, b.fileIds);
  }

  @Put("order")
  @Requires("inventory", "edit")
  reorder(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UnitPhotoOrder)) b: UnitPhotoOrder) {
    return this.photos.reorder(me, id, b.fileIds);
  }

  @Delete(":fileId")
  @HttpCode(204)
  @Requires("inventory", "edit")
  remove(@Me() me: CurrentUser, @Param("id") id: string, @Param("fileId") fileId: string) {
    return this.photos.remove(me, id, fileId);
  }
}
