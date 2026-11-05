import { Controller, HttpCode, Param, Post } from "@nestjs/common";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { UnitsService } from "./units.service";

/**
 * Q16: confirming the close after a Done Deal. Editing the inventory is the gate (Manar and Randa, Q18); which of them
 * confirms which type (Rent → Manar, the rest → Randa) is the service's rule.
 */
@Controller("inventory/units/:id/locks")
export class UnitLocksController {
  constructor(private readonly units: UnitsService) {}

  @Post(":dealId/confirm")
  @HttpCode(204)
  @Requires("inventory", "edit")
  confirm(@Me() me: CurrentUser, @Param("id") id: string, @Param("dealId") dealId: string) {
    return this.units.confirm(me, id, dealId);
  }
}
