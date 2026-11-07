import { Body, Controller, Get, HttpCode, Param, Post, Res } from "@nestjs/common";
import { ListOfOptionsInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import type { Response } from "express";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { UnitDocumentsService } from "./unit-documents.service";

/** 2.8 · 2.23 · the unit's PDF and slide, each also as PowerPoint (whoever sees the unit), and Manar's confirm (`approve`, Q15). */
@Controller("inventory/units/:id")
export class UnitDocumentsController {
  constructor(private readonly docs: UnitDocumentsService) {}

  @Get("pdf")
  @Requires("inventory", "view")
  pdf(@Me() me: CurrentUser, @Param("id") id: string, @Res() res: Response) {
    return this.send(res, this.docs.render(me, id, "pdf"));
  }

  @Get("slide")
  @Requires("inventory", "view")
  slide(@Me() me: CurrentUser, @Param("id") id: string, @Res() res: Response) {
    return this.send(res, this.docs.render(me, id, "slide"));
  }

  @Get("pdf/pptx")
  @Requires("inventory", "view")
  pdfPptx(@Me() me: CurrentUser, @Param("id") id: string, @Res() res: Response) {
    return this.send(res, this.docs.render(me, id, "pdf", "pptx"));
  }

  @Get("slide/pptx")
  @Requires("inventory", "view")
  slidePptx(@Me() me: CurrentUser, @Param("id") id: string, @Res() res: Response) {
    return this.send(res, this.docs.render(me, id, "slide", "pptx"));
  }

  @Post("pdf/confirm")
  @HttpCode(204)
  @Requires("inventory", "approve")
  confirm(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.docs.confirm(me, id);
  }

  private send(res: Response, doc: Promise<{ name: string; mime: string; body: Buffer }>) {
    return sendDoc(res, doc);
  }
}

/** M-03 6.1 «list of options as pdf»: the picked units in one file (whoever sees units; each one checked like its own PDF). */
@Controller("inventory/unit-lists")
export class UnitListsController {
  constructor(private readonly docs: UnitDocumentsService) {}

  @Post()
  @HttpCode(200)
  @Requires("inventory", "view")
  list(@Me() me: CurrentUser, @Body(new ZodPipe(ListOfOptionsInput)) body: ListOfOptionsInput, @Res() res: Response) {
    return sendDoc(res, this.docs.renderList(me, body));
  }
}

/** The PDF opens in the browser; the PowerPoint downloads. */
async function sendDoc(res: Response, doc: Promise<{ name: string; mime: string; body: Buffer }>) {
  const { name, mime, body } = await doc;
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `${mime === "application/pdf" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.end(body);
}
