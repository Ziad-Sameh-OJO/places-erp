import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { AddComment, AssignLead, TlNoteInput, RecommendAnswers, UnitListInput, ChangeStage, CreateLead, DuplicateCheck, LeadFilters, LogRoles, SummaryQuery, UpdateLead, LeadBatch, LeadBatchIds, VisitInput, VisitOutcome, VisitUnitQuery, SentLeadsQuery, DailyCallsInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { sendPdf } from "../../core/documents/documents.service";
import { sendXlsx, type ExcelColumn } from "../../core/http/excel";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { LeadsService } from "./leads.service";

type ExportRow = Awaited<ReturnType<LeadsService["exportRows"]>>[number];
/** The demo's export columns (ui.js cols.leads). */
/** `field`: the column's field (M-09 · fields/leads.ts) — a hidden one isn't in the file (its values are blank anyway). */
const EXPORT: (ExcelColumn<ExportRow> & { field?: string })[] = [
  { header: "الكود", value: (r) => r.code }, { header: "الاسم", value: (r) => r.name, width: 24 }, { header: "الشركة", value: (r) => r.company, width: 20, field: "company" },
  { header: "الموبايل", value: (r) => r.phones, width: 26, field: "phones" }, { header: "Area", value: (r) => r.area, width: 18, field: "area" }, { header: "Type", value: (r) => r.type, field: "type" },
  { header: "Space", value: (r) => r.space, field: "space" }, { header: "Budget", value: (r) => r.budget, field: "budget" }, { header: "Channel", value: (r) => r.channel, field: "channel" },
  { header: "Campaign", value: (r) => r.campaign, width: 20, field: "campaign" }, { header: "Sales", value: (r) => r.sales, width: 20 }, { header: "Stage", value: (r) => r.stage, width: 20 },
  { header: "Qualified", value: (r) => r.qualified }, { header: "Created", value: (r) => r.createdAt, width: 20 },
];

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

  /** «مكالماتي النهارده»: Telesales writes her day's total calls (client, 11 Nov). */
  @Put("calls/daily")
  @Requires("leads", "view")
  setDailyCalls(@Me() me: CurrentUser, @Body(new ZodPipe(DailyCallsInput)) b: DailyCallsInput) {
    return this.leads.setDailyCalls(me, b);
  }

  /** The Visit form's unit search (1.9): whoever books visits on leads, even without the inventory page. */
  @Get("visit-units")
  @Requires("leads", "edit")
  visitUnits(@Me() me: CurrentUser, @Query(new ZodPipe(VisitUnitQuery)) q: VisitUnitQuery) {
    return this.leads.visitUnits(me, q.q);
  }

  @Get("summary")
  @Requires("leads", "view")
  summary(@Me() me: CurrentUser, @Query(new ZodPipe(SummaryQuery)) q: SummaryQuery) {
    return this.leads.summary(me, q);
  }

  /** M-01 · Telesales' «اللي بعتيها»: hers only, without the salesperson's actions (client, 11 Nov). */
  @Get("sent")
  @Requires("leads", "create")
  sent(@Me() me: CurrentUser, @Query(new ZodPipe(SentLeadsQuery)) q: SentLeadsQuery) {
    return this.leads.sent(me, q);
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

  /** «تصدير الليدز» (demo U.exportBtn · M-12): the filtered list as Excel. */
  @Get("export")
  @Requires("leads", "export")
  async export(@Me() me: CurrentUser, @Query(new ZodPipe(LeadFilters)) f: LeadFilters, @Res() res: Response) {
    const hidden = me.fields.hidden("leads");
    await sendXlsx(res, "الليدز.xlsx", EXPORT.filter((c) => !c.field || !hidden.has(c.field)), await this.leads.exportRows(me, f), "الليدز");
  }

  /** The list's bulk bar: «حوّل لسيلز…» (also needs «leads: approve», checked in the service) and / or «غيّر المرحلة…». */
  @Post("batch")
  @HttpCode(200)
  @Requires("leads", "edit")
  batch(@Me() me: CurrentUser, @Body(new ZodPipe(LeadBatch)) body: LeadBatch) {
    return this.leads.batch(me, body);
  }

  /** The bulk bar's «أرشفة». */
  @Post("batch/archive")
  @HttpCode(200)
  @Requires("leads", "delete")
  batchArchive(@Me() me: CurrentUser, @Body(new ZodPipe(LeadBatchIds)) body: LeadBatchIds) {
    return this.leads.batchArchive(me, body.ids);
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

  /** «الوحدات» (2.12): the units that suit the client, narrowed by the answers on the lead. */
  @Get(":id/recommendations")
  @Requires("leads", "view")
  recommendations(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.leads.recommendations(me, id);
  }

  /** «جاوب عشان الـ Recommendations تقل» (M-03 3.2): the answers are saved on the lead. */
  // 1.33: «ملاحظة الـ Team Leader على الليد» (the service lets only the TL, the Sales Director and the admin write it)
  @Put(":id/tl-note")
  @Requires("leads", "edit")
  setTlNote(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(TlNoteInput)) body: TlNoteInput) {
    return this.leads.setTlNote(me, id, body);
  }

  @Put(":id/answers")
  @Requires("leads", "edit")
  setAnswers(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(RecommendAnswers)) body: RecommendAnswers) {
    return this.leads.setAnswers(me, id, body);
  }

  /** «ابعت للعميل وسجّل كومنت» (2.13): the PDF of the picked units; the comment is written on the lead. */
  @Post(":id/unit-list")
  @HttpCode(200)
  @Requires("leads", "edit")
  async unitList(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UnitListInput)) body: UnitListInput, @Res() res: Response) {
    const { name, pdf } = await this.leads.sendUnitList(me, id, body);
    sendPdf(res, name, pdf);
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

  /** «تعديل البيانات» (demo leads.js leadEdit). */
  @Put(":id")
  @Requires("leads", "edit")
  update(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UpdateLead)) body: UpdateLead) {
    return this.leads.update(me, id, body);
  }

  /** «أرشفة» (demo leads.js leadArchive): «leads: delete» is «يأرشف / يمسح» in the permission matrix. */
  @Post(":id/archive")
  @HttpCode(200)
  @Requires("leads", "delete")
  archive(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.leads.archive(me, id);
  }

  @Patch(":id/stage")
  @Requires("leads", "edit")
  changeStage(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ChangeStage)) body: ChangeStage) {
    return this.leads.changeStage(me, id, body);
  }
}
