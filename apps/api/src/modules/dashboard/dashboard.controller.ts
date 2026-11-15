import { Controller, Get, Param } from "@nestjs/common";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { DashboardService } from "./dashboard.service";

/**
 * 14.1–14.3 · HTTP only. The company dashboard and a person's performance are the reports' («التقارير والتارجت»: the
 * whole company's targets); a person's own layout and his role's dashboard are his own (@SignedIn).
 */
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("layout")
  @SignedIn()
  layout(@Me() me: CurrentUser) {
    return this.dashboard.layout(me);
  }

  @Get("company")
  @Requires("reports", "view")
  company(@Me() me: CurrentUser) {
    return this.dashboard.company(me);
  }

  @Get("mine")
  @SignedIn()
  mine(@Me() me: CurrentUser) {
    return this.dashboard.mine(me);
  }

  @Get("people/:employeeId")
  @Requires("reports", "view")
  person(@Me() me: CurrentUser, @Param("employeeId") employeeId: string) {
    return this.dashboard.person(me, employeeId);
  }
}
