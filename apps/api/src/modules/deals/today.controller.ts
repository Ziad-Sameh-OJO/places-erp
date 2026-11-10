import { Controller, Get } from "@nestjs/common";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { DealSheetService } from "./deal-sheet.service";
import { DealsService } from "./deals.service";
import { blankHidden } from "../finance/hidden-fields";

/** «مهامي النهارده»: «صفقة اتقفلت · حصّل عمولة» (M-02, meeting 4 Nov). Finance only, like the collection it leads to. */
@Controller("home")
export class DealsTodayController {
  constructor(private readonly sheet: DealSheetService, private readonly deals: DealsService) {}

  @Get("collect")
  @Requires("finance", "create")
  async toCollect(@Me() me: CurrentUser) {
    return blankHidden(await this.sheet.toCollect(me), me.fields.hidden("finance")); // M-09: a hidden finance «المبلغ» blanks the commission here too
  }

  /**
   * 0.18: deals to review, a Seller to approve, TCRs to sign. Each part needs the grant of the action it leads to
   * (deals: approve · inventory: approve · deals: view), checked in the service — Manar approves Sellers without «deals».
   */
  @Get("deals")
  @SignedIn()
  today(@Me() me: CurrentUser) {
    return this.deals.today(me);
  }
}
