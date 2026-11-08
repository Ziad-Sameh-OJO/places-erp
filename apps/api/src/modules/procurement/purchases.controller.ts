import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CustodyCap, NewPurchase, PostPurchase, PurchaseDecision, PurchaseFilters, SettlePurchase, type PurchaseStatusKey, type PurchaseView } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { sendXlsx } from "../../core/http/excel";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { PurchasesService } from "./purchases.service";

/** The screen's status words (web use-purchases STATUS). */
const STATUS: Record<PurchaseStatusKey, string> = { Pending: "Pending", Approved: "Approved", Rejected: "Rejected", Settled: "اتسوّى · مستني المالية", Posted: "اترحّل في المالية" };

/**
 * HTTP only. M-08 4.1: procurement creates and settles (create · edit), the approvers decide (approve), finance posts
 * the payment and sets the custody ceiling (finance create · edit). Everyone who sees procurement sees the requests in
 * their data scope.
 */
@Controller("procurement")
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get("overview")
  @Requires("procurement", "view")
  overview(@Me() me: CurrentUser) {
    return this.purchases.overview(me);
  }

  @Get("purchases")
  @Requires("procurement", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(PurchaseFilters)) f: PurchaseFilters) {
    return this.purchases.list(me, f);
  }

  /** «تصدير الطلبات» (demo procurement.js · M-12 0.11): the filtered requests. Before purchases/:id. */
  @Get("purchases/export")
  @Requires("procurement", "export")
  async export(@Me() me: CurrentUser, @Query(new ZodPipe(PurchaseFilters)) f: PurchaseFilters, @Res() res: Response) {
    const h = me.fields.hidden("procurement"); // M-09: a hidden field's column isn't in the file
    await sendXlsx(res, "الطلبات.xlsx", [
      { header: "الطلب", value: (p) => p.no },
      { header: "الحاجة", value: (p) => p.item, width: 30 },
      ...(h.has("amount") ? [] : [{ header: "المبلغ", value: (p: PurchaseView) => Number(p.amount) }]),
      ...(h.has("account") ? [] : [{ header: "البند", value: (p: PurchaseView) => p.account.name, width: 24 }]),
      ...(h.has("vendor") ? [] : [{ header: "المورد", value: (p: PurchaseView) => p.vendor, width: 20 }]),
      { header: "الحالة", value: (p) => STATUS[p.status], width: 22 },
      { header: "طلبه", value: (p) => p.createdBy.name, width: 22 },
      { header: "اتطلب", value: (p) => new Date(p.createdAt), width: 18 },
      { header: "وافق / رفض", value: (p) => p.decidedBy, width: 22 },
    ], await this.purchases.exportRows(me, f), "الطلبات");
  }

  /** «طلبات مشتريات مستنية الصرف» on finance's cash tab. */
  @Get("purchases/settled")
  @Requires("finance", "view")
  settled(@Me() me: CurrentUser) {
    return this.purchases.settled(me);
  }

  @Get("purchases/:id")
  @Requires("procurement", "view")
  get(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.purchases.get(me, id);
  }

  @Get("purchases/:id/files/:fileId")
  @Requires("procurement", "view")
  file(@Me() me: CurrentUser, @Param("id") id: string, @Param("fileId") fileId: string) {
    return this.purchases.file(me, id, fileId);
  }

  @Post("purchases")
  @Requires("procurement", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(NewPurchase)) body: NewPurchase) {
    return this.purchases.create(me, body);
  }

  @Post("purchases/:id/decision")
  @HttpCode(200)
  @Requires("procurement", "approve")
  decide(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(PurchaseDecision)) body: PurchaseDecision) {
    return this.purchases.decide(me, id, body);
  }

  @Post("purchases/:id/settle")
  @HttpCode(200)
  @Requires("procurement", "edit")
  settle(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(SettlePurchase)) body: SettlePurchase) {
    return this.purchases.settle(me, id, body);
  }

  @Post("purchases/:id/post")
  @Requires("finance", "create")
  post(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(PostPurchase)) body: PostPurchase) {
    return this.purchases.post(me, id, body);
  }

  @Put("custody-cap")
  @HttpCode(204)
  @Requires("finance", "edit")
  async setCap(@Me() me: CurrentUser, @Body(new ZodPipe(CustodyCap)) body: CustodyCap) {
    await this.purchases.setCap(me, body);
  }
}
