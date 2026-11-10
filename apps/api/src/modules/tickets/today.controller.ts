import { Controller, Get } from "@nestjs/common";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { TicketsService } from "./tickets.service";

/** 0.18 · «مهامي النهارده» (demo home.js): my department's open tickets with their SLA. */
@Controller("home")
export class TicketsTodayController {
  constructor(private readonly tickets: TicketsService) {}

  @Get("tickets")
  @Requires("tickets", "view")
  today(@Me() me: CurrentUser) {
    return this.tickets.today(me);
  }
}
