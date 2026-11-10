import { Controller, Get } from "@nestjs/common";
import { SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { KpisService } from "./kpis.service";

/** 11.16 · home: «الـ KPIs بتاعتي» and the KPI lines of «مهامي النهارده». Personal: everyone gets their own (the service). */
@Controller("home")
export class KpisTodayController {
  constructor(private readonly kpis: KpisService) {}

  @Get("kpis")
  @SignedIn()
  today(@Me() me: CurrentUser) {
    return this.kpis.today(me);
  }
}
