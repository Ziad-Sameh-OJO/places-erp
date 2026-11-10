import { Controller, Get } from "@nestjs/common";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { HrTodayService } from "./today.service";

/** 0.18 · «مهامي النهارده» (demo home.js): HR's and the Team Leader's lines. */
@Controller("home")
export class HrTodayController {
  constructor(private readonly today: HrTodayService) {}

  @Get("hr")
  @Requires("hr", "view")
  lines(@Me() me: CurrentUser) {
    return this.today.lines(me);
  }
}
