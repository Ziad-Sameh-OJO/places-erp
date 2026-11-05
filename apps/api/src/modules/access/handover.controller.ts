import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { HandoverDecision, HandoverInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { HandoverService } from "./handover.service";

/** M-09 2.2 · 7.1 over HTTP: whoever stops accounts asks; the leaver's direct manager decides (checked in the service). */
@Controller("access")
export class HandoverController {
  constructor(private readonly handover: HandoverService) {}

  // same right as stopping the account (M-09 1.2 · 4.1: HR)
  @Post("users/:id/handover") @Requires("access", "create")
  ask(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(HandoverInput)) b: HandoverInput) { return this.handover.ask(me, id, b); }

  // personal: only the requests waiting for the signed-in manager
  @Get("handovers/mine") @SignedIn()
  mine(@Me() me: CurrentUser) { return this.handover.mine(me); }

  @Post("handovers/:id/decision") @SignedIn() @HttpCode(204)
  decide(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(HandoverDecision)) b: HandoverDecision) { return this.handover.decide(me, id, b); }
}
