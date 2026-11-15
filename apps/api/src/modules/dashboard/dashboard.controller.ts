import { Controller, Get, Param, Query } from "@nestjs/common";
import { AhmedQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
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

  /** Ahmed Islam's one page: `?period=today|week|month|quarter` (a quarter also `&year=&quarter=`). */
  @Get("ahmed")
  @Requires("reports", "view")
  ahmed(@Me() me: CurrentUser, @Query(new ZodPipe(AhmedQuery)) q: AhmedQuery) {
    return this.dashboard.ahmed(me, q);
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
