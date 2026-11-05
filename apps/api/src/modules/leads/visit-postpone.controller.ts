import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { PostponeDecision, VisitPostpone } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { VisitPostponeService } from "./visit-postpone.service";

/** HTTP only. «اتأجلت» and the TL's decision (1.24); who decides is checked against the lead rules in the service. */
@Controller("leads")
export class VisitPostponeController {
  constructor(private readonly postpone: VisitPostponeService) {}

  @Post(":id/visits/:visitId/postpone")
  @HttpCode(200)
  @Requires("leads", "edit")
  ask(@Me() me: CurrentUser, @Param("id") id: string, @Param("visitId") visitId: string, @Body(new ZodPipe(VisitPostpone)) body: VisitPostpone) {
    return this.postpone.ask(me, id, visitId, body);
  }

  @Post(":id/visits/:visitId/postpone/decision")
  @HttpCode(200)
  @Requires("leads", "edit")
  decide(@Me() me: CurrentUser, @Param("id") id: string, @Param("visitId") visitId: string, @Body(new ZodPipe(PostponeDecision)) body: PostponeDecision) {
    return this.postpone.decide(me, id, visitId, body);
  }
}
