import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { BroadcastDone, BroadcastInput, TaskUnitQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { BroadcastsService } from "./broadcasts.service";

/** HTTP only. Rahma runs the Broadcast (marketing); each salesperson has their own Broadcast tasks (M-04 4.1). */
@Controller("marketing/broadcasts")
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get()
  @Requires("marketing", "view")
  board() {
    return this.broadcasts.board();
  }

  @Get("hot-units")
  @Requires("marketing", "create")
  hotUnits(@Query(new ZodPipe(TaskUnitQuery)) q: TaskUnitQuery) {
    return this.broadcasts.hotUnits(q.q);
  }

  /** Personal: a salesperson's own Broadcast tasks (empty for anyone else). */
  @Get("mine")
  @SignedIn()
  mine(@Me() me: CurrentUser) {
    return this.broadcasts.mine(me);
  }

  @Post()
  @Requires("marketing", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(BroadcastInput)) body: BroadcastInput) {
    return this.broadcasts.create(me, body);
  }

  @Post(":id/approve")
  @HttpCode(204)
  @Requires("marketing", "approve")
  approve(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.broadcasts.approve(me, id);
  }

  /** Personal: «Done / share» on one's own Broadcast task; the service checks it is a salesperson's. */
  @Post(":id/done")
  @HttpCode(204)
  @SignedIn()
  done(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(BroadcastDone)) body: BroadcastDone) {
    return this.broadcasts.done(me, id, body);
  }
}
