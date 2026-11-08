import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { DuplicateDecision } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { LeadDuplicatesService } from "./duplicates.service";

/**
 * Operations' duplicate queue (M-01 Q7: «الأوبريشن بس اللي يظهرلها تفاصيل العميلين»). `leads: approve` is
 * Operations, the sales director and the admin. Registered before LeadsController so `duplicates` isn't read as `:id`.
 */
@Controller("leads/duplicates")
export class LeadDuplicatesController {
  constructor(private readonly duplicates: LeadDuplicatesService) {}

  @Get()
  @Requires("leads", "approve")
  pending(@Me() me: CurrentUser) {
    return this.duplicates.pending(me);
  }

  @Post(":id/decide")
  @Requires("leads", "approve")
  @HttpCode(204)
  decide(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(DuplicateDecision)) body: DuplicateDecision) {
    return this.duplicates.decide(me, id, body);
  }
}
