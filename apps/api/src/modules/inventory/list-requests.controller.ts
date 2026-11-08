import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ListRequestInput, SendListInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ListRequestsService } from "./list-requests.service";

/**
 * 2.32 · «طلبات الـ Lists»: a request is a ticket (type «list», M-12), so the tickets' permissions guard it; who asks
 * (a Team Leader) and who sends (the inventory team) is the service's.
 */
@Controller("inventory/list-requests")
export class ListRequestsController {
  constructor(private readonly lists: ListRequestsService) {}

  @Get()
  @Requires("tickets", "view")
  list(@Me() me: CurrentUser) {
    return this.lists.list(me);
  }

  @Post()
  @Requires("tickets", "create")
  ask(@Me() me: CurrentUser, @Body(new ZodPipe(ListRequestInput)) body: ListRequestInput) {
    return this.lists.ask(me, body);
  }

  @Post(":id/send")
  @HttpCode(204)
  @Requires("tickets", "edit")
  send(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(SendListInput)) body: SendListInput) {
    return this.lists.send(me, id, body);
  }
}
