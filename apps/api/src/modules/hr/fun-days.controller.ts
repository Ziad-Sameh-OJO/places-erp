import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { FunDayInput, FunDayYearQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { FunDaysService } from "./fun-days.service";

/** HTTP only. M-05 · fun days (HR, 15 Nov): everyone signed in reads the ones for them; HR («hr: edit») plans them. */
@Controller("hr/fun-days")
export class FunDaysController {
  constructor(private readonly funDays: FunDaysService) {}

  @Get()
  @SignedIn()
  mine(@Me() me: CurrentUser, @Query(new ZodPipe(FunDayYearQuery)) q: FunDayYearQuery) {
    return this.funDays.mine(me, q.year);
  }

  @Get("upcoming")
  @SignedIn()
  upcoming(@Me() me: CurrentUser) {
    return this.funDays.upcoming(me);
  }

  @Get("plan")
  @Requires("hr", "edit")
  plan(@Query(new ZodPipe(FunDayYearQuery)) q: FunDayYearQuery) {
    return this.funDays.plan(q.year);
  }

  @Post()
  @Requires("hr", "edit")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(FunDayInput)) body: FunDayInput) {
    return this.funDays.create(me, body);
  }

  @Put(":id")
  @Requires("hr", "edit")
  update(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(FunDayInput)) body: FunDayInput) {
    return this.funDays.update(me, id, body);
  }

  @Post(":id/cancel")
  @Requires("hr", "edit")
  @HttpCode(204)
  cancel(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.funDays.cancel(me, id);
  }
}
