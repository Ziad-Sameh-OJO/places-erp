import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AddComment, ChangeStage, CreateLead, DuplicateCheck, LeadFilters } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { LeadsService } from "./leads.service";

/** HTTP only: validate input, check the permission, call the service. No business logic here. */
@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @Requires("leads", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(LeadFilters)) f: LeadFilters) {
    return this.leads.list(me, f);
  }

  // before ":id", so these aren't read as a lead id
  @Get("duplicate-check")
  @Requires("leads", "create")
  duplicateCheck(@Me() me: CurrentUser, @Query(new ZodPipe(DuplicateCheck)) q: DuplicateCheck) {
    return this.leads.checkDuplicate(me, q);
  }

  @Get("board")
  @Requires("leads", "view")
  board(@Me() me: CurrentUser, @Query(new ZodPipe(LeadFilters)) f: LeadFilters) {
    return this.leads.board(me, f);
  }

  @Get("summary")
  @Requires("leads", "view")
  summary(@Me() me: CurrentUser) {
    return this.leads.summary(me);
  }

  @Get("options")
  @Requires("leads", "view")
  options(@Me() me: CurrentUser) {
    return this.leads.options(me);
  }

  @Get(":id")
  @Requires("leads", "view")
  get(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.leads.get(me, id);
  }

  @Post(":id/comments")
  @Requires("leads", "edit")
  addComment(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(AddComment)) body: AddComment) {
    return this.leads.addComment(me, id, body);
  }

  @Post()
  @Requires("leads", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(CreateLead)) body: CreateLead) {
    return this.leads.create(me, body);
  }

  @Patch(":id/stage")
  @Requires("leads", "edit")
  changeStage(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ChangeStage)) body: ChangeStage) {
    return this.leads.changeStage(me, id, body);
  }
}
