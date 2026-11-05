import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import {
  ActivityInput, ActivityResultInput, KpiBandsInput, KpiCopyInput, KpiDeliveryInput, KpiFollowerInput, KpiItemsInput, KpiNewCardInput, KpiPayInput, KpiPlanInput, KpiScope, KpiValueInput,
  KpiWatchInput,
} from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { KpisService } from "./kpis.service";

/**
 * HTTP only. The card endpoints are @SignedIn: who may see or change a card depends on the card itself (its owner, its
 * follower, the KPI watcher), so the service decides. Money, the bands, the watchers and the quarter close need their grant.
 */
@Controller("kpis")
export class KpisController {
  constructor(private readonly kpis: KpisService) {}

  @Get("board")
  @SignedIn()
  board(@Me() me: CurrentUser, @Query(new ZodPipe(KpiScope)) q: KpiScope) {
    return this.kpis.board(me, q.scope);
  }

  @Get("company")
  @SignedIn()
  company(@Me() me: CurrentUser) {
    return this.kpis.company(me);
  }

  @Get("log")
  @SignedIn()
  log(@Me() me: CurrentUser) {
    return this.kpis.log(me);
  }

  @Get("cards/:id")
  @SignedIn()
  card(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.kpis.card(me, id);
  }

  @Post("cards")
  @SignedIn()
  createCard(@Me() me: CurrentUser, @Body(new ZodPipe(KpiNewCardInput)) body: KpiNewCardInput) {
    return this.kpis.createCard(me, body.employeeId, body.copyFrom);
  }

  @Put("cards/:id/items")
  @SignedIn()
  saveItems(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(KpiItemsInput)) body: KpiItemsInput) {
    return this.kpis.saveItems(me, id, body);
  }

  @Patch("cards/:id/items/:itemId/value")
  @HttpCode(204)
  @SignedIn()
  setValue(@Me() me: CurrentUser, @Param("id") id: string, @Param("itemId") itemId: string, @Body(new ZodPipe(KpiValueInput)) body: KpiValueInput) {
    return this.kpis.setValue(me, id, itemId, body.value);
  }

  @Post("cards/:id/items/:itemId/deliveries")
  @HttpCode(204)
  @SignedIn()
  deliver(@Me() me: CurrentUser, @Param("id") id: string, @Param("itemId") itemId: string, @Body(new ZodPipe(KpiDeliveryInput)) body: KpiDeliveryInput) {
    return this.kpis.deliver(me, id, itemId, body);
  }

  @Get("deliveries/:id/file")
  @SignedIn()
  deliveryFile(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.kpis.deliveryFile(me, id);
  }

  @Patch("cards/:id/follower")
  @HttpCode(204)
  @SignedIn()
  setFollower(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(KpiFollowerInput)) body: KpiFollowerInput) {
    return this.kpis.setFollower(me, id, body.followerId);
  }

  @Patch("cards/:id/plan")
  @HttpCode(204)
  @SignedIn()
  setPlan(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(KpiPlanInput)) body: KpiPlanInput) {
    return this.kpis.setPlan(me, id, body.plan);
  }

  @Post("cards/:id/approve")
  @HttpCode(204)
  @SignedIn()
  approve(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.kpis.approve(me, id);
  }

  @Post("cards/:id/copy")
  @SignedIn()
  copy(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(KpiCopyInput)) body: KpiCopyInput) {
    return this.kpis.copyCard(me, id, body.toEmployeeId);
  }

  @Patch("cards/:id/pay")
  @HttpCode(204)
  @Requires("kpis", "edit")
  setPay(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(KpiPayInput)) body: KpiPayInput) {
    return this.kpis.setPay(me, id, body);
  }

  @Put("bands")
  @HttpCode(204)
  @Requires("kpis", "edit")
  setBands(@Me() me: CurrentUser, @Body(new ZodPipe(KpiBandsInput)) body: KpiBandsInput) {
    return this.kpis.setBands(me, body);
  }

  @Put("watchers")
  @HttpCode(204)
  @Requires("kpis", "edit")
  setWatchers(@Me() me: CurrentUser, @Body(new ZodPipe(KpiWatchInput)) body: KpiWatchInput) {
    return this.kpis.setWatchers(me, body.userIds);
  }

  @Post("quarter/close")
  @HttpCode(204)
  @Requires("kpis", "approve")
  closeQuarter(@Me() me: CurrentUser) {
    return this.kpis.closeQuarter(me);
  }

  /** 11.13 «نشاطاتي»: each person's own Farming / Approach. */
  @Get("activities")
  @SignedIn()
  activities(@Me() me: CurrentUser) {
    return this.kpis.activities(me);
  }

  @Post("activities")
  @HttpCode(204)
  @SignedIn()
  addActivity(@Me() me: CurrentUser, @Body(new ZodPipe(ActivityInput)) body: ActivityInput) {
    return this.kpis.addActivity(me, body);
  }

  @Post("activities/:id/result")
  @HttpCode(204)
  @SignedIn()
  activityResult(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ActivityResultInput)) body: ActivityResultInput) {
    return this.kpis.activityResult(me, id, body);
  }

  @Post("quarter/next")
  @SignedIn()
  startQuarter(@Me() me: CurrentUser) {
    return this.kpis.startQuarter(me);
  }
}
