import { Controller, Get } from "@nestjs/common";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { LeadsTodayService } from "./today.service";

/** «مهامي النهارده» (1.22): the home board's lines that come from the leads. Its own path, so «leads/:id» can't catch it. */
@Controller("home")
export class LeadsTodayController {
  constructor(private readonly today: LeadsTodayService) {}

  @Get("leads")
  @Requires("leads", "view")
  items(@Me() me: CurrentUser) {
    return this.today.items(me);
  }
}
