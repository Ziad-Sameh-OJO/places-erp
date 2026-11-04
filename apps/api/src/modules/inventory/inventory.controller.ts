import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { UnitFilters, UnitInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryService } from "./inventory.service";

/** HTTP only: validate, check the permission (Q18: adding and editing is Manar's and Randa's), call the service. */
@Controller("inventory/units")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Requires("inventory", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(UnitFilters)) f: UnitFilters) {
    return this.inventory.list(me, f);
  }

  // before ":id", so these aren't read as a unit id
  @Get("summary")
  @Requires("inventory", "view")
  summary(@Me() me: CurrentUser) {
    return this.inventory.summary(me);
  }

  @Get("tabs")
  @Requires("inventory", "view")
  tabs(@Me() me: CurrentUser, @Query(new ZodPipe(UnitFilters)) f: UnitFilters) {
    return this.inventory.tabs(me, f);
  }

  @Get("options")
  @Requires("inventory", "view")
  options() {
    return this.inventory.options();
  }

  @Get(":id")
  @Requires("inventory", "view")
  get(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.inventory.get(me, id);
  }

  @Post()
  @Requires("inventory", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(UnitInput)) body: UnitInput) {
    return this.inventory.create(me, body);
  }

  @Put(":id")
  @Requires("inventory", "edit")
  update(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UnitInput)) body: UnitInput) {
    return this.inventory.update(me, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @Requires("inventory", "delete")
  archive(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.inventory.archive(me, id);
  }
}
