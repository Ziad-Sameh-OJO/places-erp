import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { AddComment, AssignLead, ChangeStage, CreateLead, DuplicateCheck, LeadFilters, LogRoles, SummaryQuery, VisitInput, VisitOutcome, VisitUnitQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { LeadsService } from "./leads.service";

/** HTTP only: validate input, check the permission, call the service. No business logic here. */
@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @Requires("leads", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(LeadFilters)) f: LeadFilters) {
    return this.leads.list(me, f);
  }

  // before ":id", so these aren't read as a lead id
  @Get("duplicate-check")
  @Requires("leads", "create")
  duplicateCheck(@Me() me: CurrentUser, @Query(new ZodPipe(DuplicateCheck)) q: DuplicateCheck) {
    return this.leads.checkDuplicate(me, q);
  }

  @Get("board")
  @Requires("leads", "view")
  board(@Me() me: CurrentUser, @Query(new ZodPipe(LeadFilters)) f: LeadFilters) {
    return this.leads.board(me, f);
  }

  @Get("calls/mine")
  @Requires("leads", "view")
  myCalls(@Me() me: CurrentUser) {
    return this.leads.myCalls(me);
  }

  /** The Visit form's unit search (1.9): whoever books visits on leads, even without the inventory page. */
  @Get("visit-units")
  @Requires("leads", "edit")
  visitUnits(@Query(new ZodPipe(VisitUnitQuery)) q: VisitUnitQuery) {
    return this.leads.visitUnits(q.q);
  }

  @Get("summary")
  @Requires("leads", "view")
  summary(@Me() me: CurrentUser, @Query(new ZodPipe(SummaryQuery)) q: SummaryQuery) {
    return this.leads.summary(me, q);
  }

  @Get("tabs")
  @Requires("leads", "view")
  tabs(@Me() me: CurrentUser, @Query(new ZodPipe(LeadFilters)) f: LeadFilters) {
    return this.leads.tabs(me, f);
  }

  @Get("options")
  @Requires("leads", "view")
  options(@Me() me: CurrentUser) {
    return this.leads.options(me);
  }

  /** «مين يشوف الـ Logs» (1.25): set from the lead's Logs tab by whoever manages access, like the demo. */
  @Put("log-roles")
  @Requires("access", "edit")
  setLogRoles(@Me() me: CurrentUser, @Body(new ZodPipe(LogRoles)) body: LogRoles) {
    return this.leads.setLogRoles(me, body);
  }

  @Get(":id")
  @Requires("leads", "view")
  get(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.leads.get(me, id);
  }

  @Get(":id/logs")
  @Requires("leads", "view") // plus the Logs rule in the service: the admin and the roles the admin picked
  logs(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.leads.logs(me, id);
  }

  @Post(":id/calls")
  @Requires("leads", "edit")
  logCall(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.leads.logCall(me, id);
  }

  @Post(":id/comments")
  @Requires("leads", "edit")
  addComment(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(AddComment)) body: AddComment) {
    return this.leads.addComment(me, id, body);
  }

  /** «Visit / Meeting جديدة» (1.9). */
  @Post(":id/visits")
  @Requires("leads", "edit")
  addVisit(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(VisitInput)) body: VisitInput) {
    return this.leads.addVisit(me, id, body);
  }

  @Put(":id/visits/:visitId")
  @Requires("leads", "edit")
  editVisit(@Me() me: CurrentUser, @Param("id") id: string, @Param("visitId") visitId: string, @Body(new ZodPipe(VisitInput)) body: VisitInput) {
    return this.leads.editVisit(me, id, visitId, body);
  }

  /** «Done» / «معملتهاش». */
  @Post(":id/visits/:visitId/outcome")
  @HttpCode(200)
  @Requires("leads", "edit")
  markVisit(@Me() me: CurrentUser, @Param("id") id: string, @Param("visitId") visitId: string, @Body(new ZodPipe(VisitOutcome)) body: VisitOutcome) {
    return this.leads.markVisit(me, id, visitId, body);
  }

  @Post()
  @Requires("leads", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(CreateLead)) body: CreateLead) {
    return this.leads.create(me, body);
  }

  /** «اسحب الليد وحوّله» (1.14): Operations, the Sales Director and the admin («leads: approve», M-01 4.1). */
  @Post(":id/assign")
  @HttpCode(200)
  @Requires("leads", "approve")
  assign(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(AssignLead)) body: AssignLead) {
    return this.leads.assign(me, id, body);
  }

  @Patch(":id/stage")
  @Requires("leads", "edit")
  changeStage(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ChangeStage)) body: ChangeStage) {
    return this.leads.changeStage(me, id, body);
  }
}
