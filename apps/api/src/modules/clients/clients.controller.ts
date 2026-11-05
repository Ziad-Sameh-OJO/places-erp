import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { AskDeletion, ClientFilters, LogInteraction, SetConsent } from "@places/contracts";
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

  /** M-10 3.1: the marketing consent is the salesperson's to write (3.1 table «السيلز»), so the same right as logging. */
  @Put(":id/consent")
  @HttpCode(204)
  @Requires("clients", "create")
  consent(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(SetConsent)) body: SetConsent) {
    return this.clients.setConsent(me, id, body);
  }

  /** M-10 2.3: whoever talks to the client files the request; management decides. */
  @Post(":id/deletion-request")
  @HttpCode(204)
  @Requires("clients", "create")
  askDeletion(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(AskDeletion)) body: AskDeletion) {
    return this.clients.askDeletion(me, id, body);
  }
}
