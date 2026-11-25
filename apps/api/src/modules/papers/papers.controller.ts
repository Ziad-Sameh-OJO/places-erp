import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { DecideDocument, Id, IssueDocument, NewTemplate, TemplateSettings } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { PapersService } from "./papers.service";

/**
 * «المستندات» over HTTP. Everyone signed in has the page; which templates they see is each template's own list, and
 * setting templates up is the Super Admin's and the Office Manager's (both checked in the service).
 */
@Controller("papers")
export class PapersController {
  constructor(private readonly papers: PapersService) {}

  @Get("templates") @SignedIn()
  cards(@Me() me: CurrentUser) { return this.papers.cards(me); }

  @Get("templates/manage") @SignedIn()
  manage(@Me() me: CurrentUser) { return this.papers.manage(me); }

  @Get("templates/options") @SignedIn()
  options(@Me() me: CurrentUser) { return this.papers.options(me); }

  @Post("templates") @SignedIn()
  create(@Me() me: CurrentUser, @Body(new ZodPipe(NewTemplate)) body: NewTemplate) { return this.papers.create(me, body); }

  @Put("templates/:id") @SignedIn()
  update(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Body(new ZodPipe(TemplateSettings)) body: TemplateSettings) { return this.papers.update(me, id, body); }

  @Delete("templates/:id") @SignedIn() @HttpCode(204)
  archive(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string) { return this.papers.archive(me, id); }

  @Get("templates/:id/file") @SignedIn()
  templateFile(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string) { return this.papers.templateFile(me, id); }

  @Post() @SignedIn()
  issue(@Me() me: CurrentUser, @Body(new ZodPipe(IssueDocument)) body: IssueDocument) { return this.papers.issue(me, body); }

  @Get("mine") @SignedIn()
  mine(@Me() me: CurrentUser) { return this.papers.mine(me); }

  @Get("approvals") @SignedIn()
  approvals(@Me() me: CurrentUser) { return this.papers.approvals(me); }

  @Post(":id/decide") @SignedIn() @HttpCode(200)
  decide(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Body(new ZodPipe(DecideDocument)) body: DecideDocument) { return this.papers.decide(me, id, body); }

  @Get(":id/file") @SignedIn()
  download(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string) { return this.papers.download(me, id); }
}
