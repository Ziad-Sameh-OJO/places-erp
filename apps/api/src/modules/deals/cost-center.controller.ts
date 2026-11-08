import { Controller, Get, Query } from "@nestjs/common";
import { CostCenterFilters } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { CostCenterService } from "./cost-center.service";
import { blankHidden } from "../finance/hidden-fields";

/** HTTP only (9.10): the «Cost Center» tab, under finance like the demo. */
@Controller("finance/cost-center")
export class CostCenterController {
  constructor(private readonly costCenter: CostCenterService) {}

  @Get()
  @Requires("finance", "view")
  async report(@Me() me: CurrentUser, @Query(new ZodPipe(CostCenterFilters)) f: CostCenterFilters) {
    return blankHidden(await this.costCenter.report(f), me.fields.hidden("finance")); // M-09: under finance, so a hidden «المبلغ» blanks its money
  }
}
