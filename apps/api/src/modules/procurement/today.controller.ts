import { Controller, Get } from "@nestjs/common";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { PurchasesService } from "./purchases.service";

/** 0.18 · «مهامي النهارده» (demo home.js): purchase requests to approve, and approved ones to pay. */
@Controller("home")
export class ProcurementTodayController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get("procurement")
  @Requires("procurement", "view")
  today(@Me() me: CurrentUser) {
    return this.purchases.today(me);
  }
}
