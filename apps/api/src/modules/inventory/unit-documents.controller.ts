import { Controller, Get, HttpCode, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { UnitDocumentsService } from "./unit-documents.service";

/** 2.8 · the unit's PDF and slide (whoever sees the unit), and Manar's confirm (`approve`, Q15). */
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

  @Post("pdf/confirm")
  @HttpCode(204)
  @Requires("inventory", "approve")
  confirm(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.docs.confirm(me, id);
  }

  private async send(res: Response, doc: Promise<{ name: string; body: Buffer }>) {
    const { name, body } = await doc;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.end(body);
  }
}
