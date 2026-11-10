import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import { AreaRouteQuery, RoutingCell } from "@places/contracts";
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

  /** 1.30: the new-lead form's «بتروح لـ: …» — whoever may add a lead, not only whoever reads the settings. */
  @Get("area")
  @Requires("leads", "create")
  forArea(@Query(new ZodPipe(AreaRouteQuery)) q: AreaRouteQuery) {
    return this.routing.forArea(q.area);
  }

  @Put()
  @Requires("settings", "edit")
  set(@Me() me: CurrentUser, @Body(new ZodPipe(RoutingCell)) body: RoutingCell) {
    return this.routing.set(me, body);
  }
}
