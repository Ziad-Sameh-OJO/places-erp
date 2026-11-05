import { Controller, Get } from "@nestjs/common";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryService } from "./inventory.service";

/** «مهامي النهارده» (2.20): the home board's lines for units missing data. Its own path, so «units/:id» can't catch it. */
@Controller("home")
export class InventoryTodayController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("inventory")
  @Requires("inventory", "view")
  missing(@Me() me: CurrentUser) {
    return this.inventory.missingToday(me);
  }
}
