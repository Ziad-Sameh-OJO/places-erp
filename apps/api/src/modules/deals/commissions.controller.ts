import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PayCommission } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { CommissionsService } from "./commissions.service";

/** HTTP only (9.15): the accountant's «كشف عمولة» and «صرف عمولة سيلز», under finance like the demo. */
@Controller("finance/commissions")
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Post("payouts")
  @Requires("finance", "create")
  pay(@Me() me: CurrentUser, @Body(new ZodPipe(PayCommission)) body: PayCommission) {
    return this.commissions.pay(me, body);
  }

  @Get()
  @Requires("finance", "view")
  people() {
    return this.commissions.people();
  }

  @Get(":employeeId")
  @Requires("finance", "view")
  statement(@Param("employeeId") employeeId: string) {
    return this.commissions.statement(employeeId);
  }
}
