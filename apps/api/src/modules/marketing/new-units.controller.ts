import { Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryService } from "../inventory/inventory.service";

/**
 * M-03 6.2 · 7.1 (M-04 4.4): «وحدة جديدة اتضافت للانفنتوري → إشعار فوري للتسويق، وتظهر في لوحة المهام».
 * The Live Alert itself is sent when the unit is created; this is marketing's board of them: Done hides one, Undo
 * brings it back. The units are the inventory's, so it goes through InventoryService.
 */
@Controller("marketing/new-units")
export class NewUnitsController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Requires("marketing", "view")
  list() {
    return this.inventory.forMarketing();
  }

  @Post(":id/done")
  @HttpCode(200)
  @Requires("marketing", "edit")
  done(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.inventory.marketingDone(me, id, true);
  }

  @Delete(":id/done")
  @Requires("marketing", "edit")
  undo(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.inventory.marketingDone(me, id, false);
  }
}
