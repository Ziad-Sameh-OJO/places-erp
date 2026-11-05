import { Controller, Get, Query } from "@nestjs/common";
import { CostCenterFilters } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { CostCenterService } from "./cost-center.service";

/** HTTP only (9.10): the «Cost Center» tab, under finance like the demo. */
@Controller("finance/cost-center")
export class CostCenterController {
  constructor(private readonly costCenter: CostCenterService) {}

  @Get()
  @Requires("finance", "view")
  report(@Query(new ZodPipe(CostCenterFilters)) f: CostCenterFilters) {
    return this.costCenter.report(f);
  }
}
