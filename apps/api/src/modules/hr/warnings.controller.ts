import { Body, Controller, Get, Inject, Param, Post, Put, Query } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { ImprovementThreshold, IssueWarning, NewWarning, PlanStep, RequestPlan, SubmitPlan, WarningSettings, WarningsQuery } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { WarningsService } from "./warnings.service";
import { ImprovementService } from "./improvement.service";
import type { Tx } from "./hr.repository";

/** HTTP only. M-05 · warnings (HR: hr edit) and the improvement plan (HR asks and follows; the TL writes: hr approve). */
@Controller("hr")
export class WarningsController {
  constructor(private readonly warnings: WarningsService, private readonly plans: ImprovementService, @Inject(PRISMA) private readonly db: PrismaClient) {}

  private readonly run = <T>(fn: (tx: Tx) => Promise<T>) => this.db.$transaction(fn);

  @Get("warnings")
  @Requires("hr", "edit")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(WarningsQuery)) q: { employeeId?: string }) {
    return this.warnings.list(me, q.employeeId);
  }

  @Post("warnings")
  @Requires("hr", "edit")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(NewWarning)) body: NewWarning) {
    return this.warnings.create(me, body, this.run);
  }

  @Get("warnings/settings")
  @Requires("hr", "edit")
  settings(@Me() me: CurrentUser) {
    this.warnings.hrOnly(me);
    return this.warnings.settings();
  }

  @Put("warnings/settings")
  @Requires("hr", "edit")
  setSettings(@Me() me: CurrentUser, @Body(new ZodPipe(WarningSettings)) body: WarningSettings) {
    return this.warnings.setSettings(me, body, this.run);
  }

  @Post("warnings/:id/issue")
  @Requires("hr", "edit")
  issue(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(IssueWarning)) body: { type: string }) {
    return this.warnings.issue(me, id, body.type, this.run);
  }

  @Post("warnings/:id/dismiss")
  @Requires("hr", "edit")
  dismiss(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.warnings.dismiss(me, id, this.run);
  }

  @Get("warnings/:id/pdf")
  @Requires("hr", "edit")
  pdf(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.warnings.pdf(me, id);
  }

  /* ---- the improvement plan ---- */
  @Get("improvement")
  @Requires("hr", "approve")
  improvement(@Me() me: CurrentUser) {
    return this.plans.view(me);
  }

  @Put("improvement/threshold")
  @Requires("hr", "edit")
  setThreshold(@Me() me: CurrentUser, @Body(new ZodPipe(ImprovementThreshold)) body: { threshold: number }) {
    return this.plans.setThreshold(me, body.threshold, this.run);
  }

  @Post("improvement")
  @Requires("hr", "edit")
  request(@Me() me: CurrentUser, @Body(new ZodPipe(RequestPlan)) body: { employeeId: string }) {
    return this.plans.request(me, body.employeeId, this.run);
  }

  @Post("improvement/:id/submit")
  @Requires("hr", "approve")
  submit(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(SubmitPlan)) body: SubmitPlan) {
    return this.plans.submit(me, id, body, this.run);
  }

  @Post("improvement/:id/step")
  @Requires("hr", "edit")
  step(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(PlanStep)) body: PlanStep) {
    return this.plans.step(me, id, body, this.run);
  }
}
