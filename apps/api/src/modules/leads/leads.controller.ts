import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ChangeStage, CreateLead, LeadFilters } from "@places/contracts";
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
