import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { HolidayInput, Id, LeadRulesInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";
import { LeadRulesService } from "./lead-rules.service";

/** HTTP only · «قواعد الليدز والتوزيع» (module «settings»): the rules, and the official holidays from its SLA tab. */
@Controller("leads/rules")
export class LeadRulesController {
  constructor(private readonly rules: LeadRulesService, private readonly settings: SettingsService) {}

  @Get()
  @Requires("settings", "view")
  get() {
    return this.rules.get();
  }

  @Get("options")
  @Requires("settings", "view")
  options() {
    return this.rules.options();
  }

  @Put()
  @Requires("settings", "edit")
  set(@Me() me: CurrentUser, @Body(new ZodPipe(LeadRulesInput)) body: LeadRulesInput) {
    return this.rules.set(me, body);
  }

  /** The demo's SLA tab adds and removes official holidays too («بتتعدّل من هنا ومن الإعدادات»). */
  @Get("holidays")
  @Requires("settings", "view")
  holidays() {
    return this.settings.holidays();
  }

  @Post("holidays")
  @Requires("settings", "edit")
  addHoliday(@Me() me: CurrentUser, @Body(new ZodPipe(HolidayInput)) body: HolidayInput) {
    return this.settings.addHoliday(me, body, "settings");
  }

  @Delete("holidays/:id")
  @HttpCode(204)
  @Requires("settings", "edit")
  removeHoliday(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string) {
    return this.settings.removeHoliday(me, id, "settings");
  }
}
