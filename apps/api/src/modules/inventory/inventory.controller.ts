import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { OwnerUpdateInput, UnitFilters, UnitInput, type UnitRow } from "@places/contracts";
import { localDate } from "@places/domain";
import { ZodPipe } from "../../core/http/zod.pipe";
import { type ExcelColumn, sendXlsx } from "../../core/http/excel";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryService } from "./inventory.service";

const STATUS: Record<UnitRow["status"], string> = { available: "Available", rented: "Rented", sold: "Sold" };

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

  /**
   * 2.28 · «تصدير الوحدات»: the demo's columns (ui.js `cols.units`); a column on a field hidden from the reader isn't in
   * the file (M-09, the service blanks the values too).
   */
  @Get("export")
  @Requires("inventory", "export")
  async export(@Me() me: CurrentUser, @Query(new ZodPipe(UnitFilters)) f: UnitFilters, @Res() res: Response) {
    const hidden = me.fields.hidden("inventory");
    const cols: (ExcelColumn<UnitRow> & { field?: string })[] = [
      { header: "Code", value: (u) => u.code },
      { header: "Type", value: (u) => (u.alsoType ? `${u.type} + ${u.alsoType}` : u.type) },
      { header: "Project", value: (u) => u.project, width: 26 },
      { field: "area", header: "Area", value: (u) => u.area, width: 18 },
      { field: "space", header: "Space", value: (u) => u.space },
      { field: "floor", header: "Floor", value: (u) => u.floor },
      { field: "condition", header: "Condition", value: (u) => u.condition, width: 16 },
      { field: "totalPrice", header: "Total", value: (u) => (u.totalPrice == null ? null : Number(u.totalPrice)), width: 16 },
      { field: "agent", header: "Agent", value: (u) => u.agent?.name, width: 20 },
      { header: "Status", value: (u) => STATUS[u.status] },
      { field: "lastOwnerUpdateAt", header: "Last update", value: (u) => (u.lastOwnerUpdateAt ? localDate(new Date(u.lastOwnerUpdateAt)) : null) }, // the Cairo day,
    ];
    await sendXlsx(res, "الوحدات.xlsx", cols.filter((c) => !c.field || !hidden.has(c.field)), await this.inventory.exportRows(me, f), "الوحدات");
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

  /** 2.29 · «ابديت مع المالك النهارده» (the people who edit units, like the demo's button) */
  @Post(":id/owner-update")
  @HttpCode(200)
  @Requires("inventory", "edit")
  ownerUpdate(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(OwnerUpdateInput)) body: OwnerUpdateInput) {
    return this.inventory.ownerUpdate(me, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @Requires("inventory", "delete")
  archive(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.inventory.archive(me, id);
  }
}
