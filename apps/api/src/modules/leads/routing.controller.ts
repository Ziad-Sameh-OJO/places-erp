import { Body, Controller, Get, Put } from "@nestjs/common";
import { RoutingCell } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { RoutingService } from "./routing.service";

/** HTTP only. «قواعد الليدز والتوزيع» is the «settings» module of the matrix (إعدادات التوزيع). */
@Controller("leads/routing")
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Get()
  @Requires("settings", "view")
  view() {
    return this.routing.view();
  }

  @Put()
  @Requires("settings", "edit")
  set(@Me() me: CurrentUser, @Body(new ZodPipe(RoutingCell)) body: RoutingCell) {
    return this.routing.set(me, body);
  }
}
