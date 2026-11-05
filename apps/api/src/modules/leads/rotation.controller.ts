import { Body, Controller, Delete, Get, Put } from "@nestjs/common";
import { RotationOrder } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { RotationService } from "./rotation.service";

/** HTTP only. «ترتيب الروتيشن النهارده» (1.23) is part of the routing settings («settings» in the matrix). */
@Controller("leads/rotation")
export class RotationController {
  constructor(private readonly rotation: RotationService) {}

  @Get()
  @Requires("settings", "view")
  view() {
    return this.rotation.view();
  }

  @Put()
  @Requires("settings", "edit")
  set(@Me() me: CurrentUser, @Body(new ZodPipe(RotationOrder)) body: RotationOrder) {
    return this.rotation.set(me, body.ids);
  }

  @Delete()
  @Requires("settings", "edit")
  reset(@Me() me: CurrentUser) {
    return this.rotation.reset(me);
  }
}
