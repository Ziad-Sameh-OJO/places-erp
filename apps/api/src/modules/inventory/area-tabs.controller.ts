import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { AreaTabInput, UnitFilters } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { AreaTabsService } from "./area-tabs.service";

/** HTTP only. Everyone who sees the inventory sees the tabs; Manar and Randa (inventory edit) change them. */
@Controller("inventory/area-tabs")
export class AreaTabsController {
  constructor(private readonly tabs: AreaTabsService) {}

  @Get()
  @Requires("inventory", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(UnitFilters)) f: UnitFilters) {
    return this.tabs.list(me, f);
  }

  @Post()
  @Requires("inventory", "edit")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(AreaTabInput)) body: AreaTabInput) {
    return this.tabs.create(me, body);
  }

  @Patch(":id")
  @Requires("inventory", "edit")
  update(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(AreaTabInput)) body: AreaTabInput) {
    return this.tabs.update(me, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @Requires("inventory", "edit")
  remove(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.tabs.remove(me, id);
  }
}
