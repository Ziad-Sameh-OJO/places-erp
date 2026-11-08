import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PayCommission } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { CommissionsService } from "./commissions.service";
import { blankHidden, notYours } from "../finance/hidden-fields";

/** M-09: under finance, so a hidden finance «المبلغ» blanks the money here too (with what's due, which the finance catalog can't cover). */
const money = (me: CurrentUser) => { const h = me.fields.hidden("finance"); return h.has("amount") ? new Set([...h, "due"]) : h; };


/** HTTP only (9.15): the accountant's «كشف عمولة» and «صرف عمولة سيلز», under finance like the demo. */
@Controller("finance/commissions")
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Post("payouts")
  @Requires("finance", "create")
  async pay(@Me() me: CurrentUser, @Body(new ZodPipe(PayCommission)) body: PayCommission) {
    if (me.fields.fixed("finance").has("amount")) throw notYours("المبلغ");
    return blankHidden(await this.commissions.pay(me, body), money(me));
  }

  @Get()
  @Requires("finance", "view")
  async people(@Me() me: CurrentUser) {
    return blankHidden(await this.commissions.people(), money(me));
  }

  @Get(":employeeId")
  @Requires("finance", "view")
  async statement(@Me() me: CurrentUser, @Param("employeeId") employeeId: string) {
    return blankHidden(await this.commissions.statement(employeeId), money(me));
  }
}
