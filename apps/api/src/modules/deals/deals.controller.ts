import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CancelDeal, CollectDeal, CreateDeal, DealExecution, DealFilters, DealNote, DealPapers, DealUnitQuery, ReviewDeal } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { DocumentsService, sendPdf } from "../../core/documents/documents.service";
import { DealsService } from "./deals.service";

/** HTTP only (M-02): validate, check the permission, call the service. */
@Controller("deals")
export class DealsController {
  constructor(private readonly deals: DealsService, private readonly docs: DocumentsService) {}

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
  units(@Me() me: CurrentUser, @Query(new ZodPipe(DealUnitQuery)) q: DealUnitQuery) {
    return this.deals.units(me, q.q);
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

  /** «سجّل تحصيل» (5.3): Finance records collections, like the demo (`finance: create`). */
  @Post(":id/collections")
  @Requires("finance", "create")
  collect(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(CollectDeal)) body: CollectDeal) {
    return this.deals.collect(me, id, body);
  }

  /** «وافقي على الـ Seller» (5.4): Manar, like the demo (`inventory: approve`). */
  @Post(":id/seller")
  @HttpCode(200)
  @Requires("inventory", "approve")
  approveSeller(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.deals.approveSeller(me, id);
  }

  /** 5.12: a salesperson on the TCR signs it; the service checks it's theirs (deal scope + their own line). */
  @Post(":id/tcrs/:tcrId/sign")
  @HttpCode(200)
  @Requires("deals", "view")
  sign(@Me() me: CurrentUser, @Param("id") id: string, @Param("tcrId") tcrId: string) {
    return this.deals.sign(me, id, tcrId);
  }

  /** 5.13: the TCR as a PDF, for whoever sees the deal. */
  @Get(":id/tcrs/:tcrId/pdf")
  @Requires("deals", "view")
  async tcrPdf(@Me() me: CurrentUser, @Param("id") id: string, @Param("tcrId") tcrId: string, @Res() res: Response) {
    const { name, html } = await this.deals.tcrDocument(me, id, tcrId);
    sendPdf(res, name, await this.docs.pdf(html));
  }

  /** «الغي الصفقة» (M-02 2.3 (12) · 9.6), reversing its entries: «deals: delete» (Admin, Office Manager — Q43's one allowed user). */
  @Post(":id/cancel")
  @HttpCode(200)
  @Requires("deals", "delete")
  cancel(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(CancelDeal)) body: CancelDeal) {
    return this.deals.cancel(me, id, body);
  }

  /** «note» (M-02 3.1): «deals: edit», and the service narrows it to the Office Manager and Finance (writesNote). */
  @Put(":id/note")
  @Requires("deals", "edit")
  setNote(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(DealNote)) body: DealNote) {
    return this.deals.setNote(me, id, body);
  }

  /** «ميعاد تنفيذ الصفقة» (M-02 3.1): the Office Manager — «deals: approve», her review right. */
  @Put(":id/execution")
  @Requires("deals", "approve")
  setExecution(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(DealExecution)) body: DealExecution) {
    return this.deals.setExecution(me, id, body);
  }

  /** «مراجعة أوراق الصفقة» (M-02 3.1): Finance — «finance: edit». */
  @Put(":id/papers")
  @Requires("finance", "edit")
  setPapers(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(DealPapers)) body: DealPapers) {
    return this.deals.setPapers(me, id, body);
  }
}
