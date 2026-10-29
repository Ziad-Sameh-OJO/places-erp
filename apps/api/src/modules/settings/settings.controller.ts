import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { HolidayInput, SettingKeyParam, type SettingKey } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "./settings.service";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Everybody reads the lists (every form needs them); only «master: edit» changes them. */
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get() @SignedIn()
  all() { return this.settings.all(); }

  @Get("stages") @SignedIn()
  stages() { return this.settings.stages(); }

  @Get("holidays") @SignedIn()
  holidays() { return this.settings.holidays(); }

  @Post("holidays") @Requires("master", "edit") @HttpCode(204)
  addHoliday(@Me() me: CurrentUser, @Body(new ZodPipe(HolidayInput)) b: HolidayInput) { return this.settings.addHoliday(me, b); }

  @Delete("holidays/:day") @Requires("master", "edit") @HttpCode(204)
  removeHoliday(@Me() me: CurrentUser, @Param("day", new ZodPipe(Day)) day: string) { return this.settings.removeHoliday(me, day); }

  @Put(":key") @Requires("master", "edit")
  set(@Me() me: CurrentUser, @Param("key", new ZodPipe(SettingKeyParam)) key: SettingKey, @Body() body: { value: unknown }) {
    return this.settings.set(me, key, body?.value);
  }
}
