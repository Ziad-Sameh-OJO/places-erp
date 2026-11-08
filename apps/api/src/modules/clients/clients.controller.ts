import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { AskDeletion, ClientFilters, LogInteraction, SetConsent, type ClientRow } from "@places/contracts";
import type { ClientKind } from "@places/domain";
import { ZodPipe } from "../../core/http/zod.pipe";
import { type ExcelColumn, sendXlsx } from "../../core/http/excel";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ClientsService } from "./clients.service";

/** The demo's chips in words (clients.js «عميل» · «مالك»). */
const KIND: Record<ClientKind, string> = { client: "عميل", owner: "مالك", both: "عميل + مالك" };

/** HTTP only: validate, check the permission, call the service. */
@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @Requires("clients", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(ClientFilters)) f: ClientFilters) {
    return this.clients.list(me, f);
  }

  /** «تصدير العملاء والملاك» (demo clients.js · M-12 0.11): the filtered list; owners' numbers only for who may see them (M-10 4.1). Before ":id". */
  @Get("export")
  @Requires("clients", "export")
  async export(@Me() me: CurrentUser, @Query(new ZodPipe(ClientFilters)) f: ClientFilters, @Res() res: Response) {
    const hidden = me.fields.hidden("clients"); // M-09: the service blanks the values; the columns go too
    const cols: (ExcelColumn<ClientRow> & { field?: string })[] = [
      { header: "الاسم", value: (p) => p.name, width: 26 },
      { field: "company", header: "الشركة", value: (p) => p.company, width: 22 },
      { field: "phones", header: "الأرقام", value: (p) => p.phones?.join(" / "), width: 28 },
      { header: "النوع", value: (p) => KIND[p.kind] },
      { field: "units", header: "الوحدات", value: (p) => p.units },
      { field: "deals", header: "الصفقات", value: (p) => p.deals },
      { header: "الحالة", value: (p) => (p.status === "inactive" ? "Inactive" : "Active") },
      { field: "lastContactAt", header: "آخر تواصل", value: (p) => new Date(p.lastContactAt), width: 18 },
    ];
    await sendXlsx(res, "العملاء والملاك.xlsx", cols.filter((c) => !c.field || !hidden.has(c.field)), await this.clients.exportRows(me, f), "العملاء والملاك");
  }

  // before ":id", so it isn't read as a file id
  @Get("summary")
  @Requires("clients", "view")
  summary(@Me() me: CurrentUser) {
    return this.clients.summary(me);
  }

  @Get(":id")
  @Requires("clients", "view")
  file(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.clients.file(me, id);
  }

  /** M-10 4.1: sales «يسجّل تواصل» on their clients — a create on the module, so a read-only role (finance) can't. */
  @Post(":id/interactions")
  @Requires("clients", "create")
  log(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(LogInteraction)) body: LogInteraction) {
    return this.clients.logInteraction(me, id, body);
  }

  /** M-10 3.1: the marketing consent is the salesperson's to write (3.1 table «السيلز»), so the same right as logging. */
  @Put(":id/consent")
  @HttpCode(204)
  @Requires("clients", "create")
  consent(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(SetConsent)) body: SetConsent) {
    return this.clients.setConsent(me, id, body);
  }

  /** M-10 2.3: whoever talks to the client files the request; management decides. */
  @Post(":id/deletion-request")
  @HttpCode(204)
  @Requires("clients", "create")
  askDeletion(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(AskDeletion)) body: AskDeletion) {
    return this.clients.askDeletion(me, id, body);
  }
}
