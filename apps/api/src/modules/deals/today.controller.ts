import { Controller, Get } from "@nestjs/common";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { DealSheetService } from "./deal-sheet.service";

/** «مهامي النهارده»: «صفقة اتقفلت · حصّل عمولة» (M-02, meeting 4 Nov). Finance only, like the collection it leads to. */
@Controller("home")
export class DealsTodayController {
  constructor(private readonly sheet: DealSheetService) {}

  @Get("collect")
  @Requires("finance", "create")
  toCollect(@Me() me: CurrentUser) {
    return this.sheet.toCollect(me);
  }
}
