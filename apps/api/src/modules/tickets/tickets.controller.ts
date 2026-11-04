import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CreateTicket, SlaReportQuery, TicketFilters, TicketReply, TransferTicket } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { TicketsService } from "./tickets.service";

/** HTTP only: validate input, check the permission, call the service. Who may act on which ticket is the service's. */
@Controller("tickets")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @Requires("tickets", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(TicketFilters)) f: TicketFilters) {
    return this.tickets.list(me, f);
  }

  // before ":id", so these aren't read as a ticket id
  @Get("summary")
  @Requires("tickets", "view")
  summary(@Me() me: CurrentUser) {
    return this.tickets.summary(me);
  }

  @Get("options")
  @Requires("tickets", "view")
  options() {
    return this.tickets.options();
  }

  /** M-06 6.1 · response speed per department: a report (KPI of the COO and the Office Manager). */
  @Get("report")
  @Requires("reports", "view")
  report(@Query(new ZodPipe(SlaReportQuery)) q: SlaReportQuery) {
    return this.tickets.report(q);
  }

  @Get(":id")
  @Requires("tickets", "view")
  get(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.tickets.get(me, id);
  }

  @Post()
  @Requires("tickets", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(CreateTicket)) body: CreateTicket) {
    return this.tickets.create(me, body);
  }

  @Post(":id/replies")
  @HttpCode(200)
  @Requires("tickets", "edit")
  reply(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(TicketReply)) body: TicketReply) {
    return this.tickets.reply(me, id, body);
  }

  @Post(":id/transfer")
  @HttpCode(200)
  @Requires("tickets", "edit")
  transfer(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(TransferTicket)) body: TransferTicket) {
    return this.tickets.transfer(me, id, body);
  }

  @Post(":id/close")
  @HttpCode(200)
  @Requires("tickets", "edit")
  close(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.tickets.close(me, id);
  }
}
