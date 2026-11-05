import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { CreateDeal, DealFilters, DealNote, DealUnitQuery, ReviewDeal } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { DealsService } from "./deals.service";

/** HTTP only (M-02): validate, check the permission, call the service. */
@Controller("deals")
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  @Requires("deals", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(DealFilters)) f: DealFilters) {
    return this.deals.list(me, f);
  }

  /** «سجّل صفقة»'s choices; before ":id" so they aren't read as a deal id. */
  @Get("form")
  @Requires("deals", "create")
  form(@Me() me: CurrentUser) {
    return this.deals.form(me);
  }

  @Get("units")
  @Requires("deals", "create")
  units(@Query(new ZodPipe(DealUnitQuery)) q: DealUnitQuery) {
    return this.deals.units(q.q);
  }

  @Get(":id")
  @Requires("deals", "view")
  get(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.deals.get(me, id);
  }

  @Post()
  @Requires("deals", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(CreateDeal)) body: CreateDeal) {
    return this.deals.create(me, body);
  }

  /** The Office Manager's review (Q9): «deals: approve» in the role matrix. */
  @Post(":id/review")
  @HttpCode(200)
  @Requires("deals", "approve")
  review(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ReviewDeal)) body: ReviewDeal) {
    return this.deals.review(me, id, body);
  }

  /** «note» (M-02 3.1): the Office Manager and Finance — «deals: edit» in the role matrix. */
  @Put(":id/note")
  @Requires("deals", "edit")
  setNote(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(DealNote)) body: DealNote) {
    return this.deals.setNote(me, id, body);
  }
}
