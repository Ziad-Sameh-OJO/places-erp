import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ClientFilters, LogInteraction } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ClientsService } from "./clients.service";

/** HTTP only: validate, check the permission, call the service. */
@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @Requires("clients", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(ClientFilters)) f: ClientFilters) {
    return this.clients.list(me, f);
  }

  // before ":id", so it isn't read as a file id
  @Get("summary")
  @Requires("clients", "view")
  summary(@Me() me: CurrentUser) {
    return this.clients.summary(me);
  }

  @Get(":id")
  @Requires("clients", "view")
  file(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.clients.file(me, id);
  }

  /** M-10 4.1: sales «يسجّل تواصل» on their clients — a create on the module, so a read-only role (finance) can't. */
  @Post(":id/interactions")
  @Requires("clients", "create")
  log(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(LogInteraction)) body: LogInteraction) {
    return this.clients.logInteraction(me, id, body);
  }
}
