import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ContractFilters, ContractMonth, CreateContract, DecideValue, Id, ProposeValue, RecordPayment, TerminateContract } from "@places/contracts";
import { DocumentsService, sendPdf } from "../../core/documents/documents.service";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ContractsService } from "./contracts.service";

/** HTTP only (M-11): validate, check the permission, call the service. */
@Controller("contracts")
export class ContractsController {
  constructor(private readonly contracts: ContractsService, private readonly pdf: DocumentsService) {}

  @Get()
  @Requires("contracts", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(ContractFilters)) f: ContractFilters) {
    return this.contracts.list(me, f);
  }

  // before ":id", so these aren't read as a contract id
  @Get("summary")
  @Requires("contracts", "view")
  summary(@Me() me: CurrentUser) {
    return this.contracts.summary(me);
  }

  @Get("calendar")
  @Requires("contracts", "view")
  calendar(@Me() me: CurrentUser, @Query(new ZodPipe(ContractMonth)) q: ContractMonth) {
    return this.contracts.calendar(me, q.month);
  }

  /** «تقرير التحصيل» for a month (M-11 6.1). */
  @Get("collections")
  @Requires("contracts", "view")
  collections(@Me() me: CurrentUser, @Query(new ZodPipe(ContractMonth)) q: ContractMonth) {
    return this.contracts.collections(me, q.month);
  }

  /** 6.7: a payment's receipt as a PDF, with the stamp and signature (12.12). */
  @Get("payments/:id/receipt")
  @Requires("contracts", "view")
  async receipt(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Res() res: Response) {
    const { name, html } = await this.contracts.receipt(me, id);
    sendPdf(res, name, await this.pdf.pdf(html));
  }

  /** M-11 4.1: Finance records payments («contracts: edit»); sales may not. */
  @Post("installments/:id/payments")
  @Requires("contracts", "edit")
  pay(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Body(new ZodPipe(RecordPayment)) body: RecordPayment) {
    return this.contracts.pay(me, id, body);
  }

  @Get("form")
  @Requires("contracts", "create")
  form(@Me() me: CurrentUser) {
    return this.contracts.form(me);
  }

  @Get(":id")
  @Requires("contracts", "view")
  get(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.contracts.get(me, id);
  }

  @Get(":id/file")
  @Requires("contracts", "view")
  file(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.contracts.fileUrl(me, id);
  }

  /** M-11 4.1: the salesperson uploads the contract («contracts: create»). */
  @Post()
  @Requires("contracts", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(CreateContract)) body: CreateContract) {
    return this.contracts.create(me, body);
  }

  /** «فسخ العقد» (M-11 2.3): the demo shows it to whoever approves contracts. */
  @Post(":id/terminate")
  @HttpCode(200)
  @Requires("contracts", "approve")
  terminate(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(TerminateContract)) body: TerminateContract) {
    return this.contracts.terminate(me, id, body);
  }

  /** M-11 2.2: whoever uploads contracts asks for a new value… */
  @Post(":id/value")
  @HttpCode(200)
  @Requires("contracts", "create")
  proposeValue(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ProposeValue)) body: ProposeValue) {
    return this.contracts.proposeValue(me, id, body);
  }

  /** …and management approves or refuses it. */
  @Post(":id/value/decision")
  @HttpCode(200)
  @Requires("contracts", "approve")
  decideValue(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(DecideValue)) body: DecideValue) {
    return this.contracts.decideValue(me, id, body);
  }
}
