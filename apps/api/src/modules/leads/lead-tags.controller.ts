import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { TagDecision, TagRequest, TagsQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { LeadTagsService } from "./lead-tags.service";

/** HTTP only. M-01 · Tags on a lead (client, 11 Nov): ask, the Team Leader decides, the «Tags» tab. */
@Controller("lead-tags")
export class LeadTagsController {
  constructor(private readonly tags: LeadTagsService) {}

  @Get()
  @Requires("leads", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(TagsQuery)) q: TagsQuery) {
    return this.tags.list(me, q);
  }

  @Get("people")
  @Requires("leads", "view")
  people() {
    return this.tags.people();
  }

  @Post()
  @Requires("leads", "view")
  request(@Me() me: CurrentUser, @Body(new ZodPipe(TagRequest)) body: TagRequest) {
    return this.tags.request(me, body);
  }

  @Post(":id/decide")
  @Requires("leads", "view")
  @HttpCode(200)
  decide(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(TagDecision)) body: TagDecision) {
    return this.tags.decide(me, id, body);
  }
}
