import { Controller, Get } from "@nestjs/common";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ContractsService } from "./contracts.service";

/** 0.18 · «مهامي النهارده» (demo home.js): the contracts in my scope ending within 30 days (a renewal chance). */
@Controller("home")
export class ContractsTodayController {
  constructor(private readonly contracts: ContractsService) {}

  @Get("contracts")
  @Requires("contracts", "view")
  today(@Me() me: CurrentUser) {
    return this.contracts.today(me);
  }
}
