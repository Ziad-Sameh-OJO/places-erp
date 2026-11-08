import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RouteNewLead } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { NewLeadsService } from "./new-leads.service";

/**
 * 1.17 · New Leads from Telesales (M-01 2.3). Telesales sends (`leads: edit`, on her own lead); Operations, the sales
 * director and the admin decide (`leads: approve`). Registered before LeadsController so `new-leads` isn't read as `:id`.
 */
@Controller("leads/new-leads")
export class NewLeadsController {
  constructor(private readonly newLeads: NewLeadsService) {}

  @Get()
  @Requires("leads", "approve")
  pending(@Me() me: CurrentUser) {
    return this.newLeads.pending(me);
  }

  @Post(":id")
  @Requires("leads", "edit")
  request(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.newLeads.request(me, id);
  }

  @Post(":id/route")
  @Requires("leads", "approve")
  route(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(RouteNewLead)) body: RouteNewLead) {
    return this.newLeads.route(me, id, body);
  }
}
