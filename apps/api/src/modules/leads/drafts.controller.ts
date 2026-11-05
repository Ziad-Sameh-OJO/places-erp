import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { DraftDecision, DraftQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { DraftsService } from "./drafts.service";

/**
 * 1.26 · 1.27 the Draft tabs. `leads: view` here, and the service lets only the people «قواعد الليدز» names (and the
 * admin) in (403 otherwise). Registered before LeadsController so `drafts` isn't read as `:id`.
 */
@Controller("leads/drafts")
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Get()
  @Requires("leads", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(DraftQuery)) q: DraftQuery) {
    return this.drafts.list(me, q.kind);
  }

  @Post(":id/decide")
  @Requires("leads", "view")
  decide(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(DraftDecision)) body: DraftDecision) {
    return this.drafts.decide(me, id, body);
  }
}
