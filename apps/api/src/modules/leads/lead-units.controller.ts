import { Body, Controller, Get, HttpCode, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { ListOfOptionsInput, ShortlistInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { sendDoc } from "../inventory/unit-documents.controller";
import { LeadUnitsService } from "./lead-units.service";

/** 14.8 – 14.11 · the lead's units log, its Short list, and a List of options recorded on it. HTTP only. */
@Controller("leads/:id")
export class LeadUnitsController {
  constructor(private readonly units: LeadUnitsService) {}

  @Get("unit-journey")
  @Requires("leads", "view")
  journey(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.units.journey(me, id);
  }

  @Post("shortlist")
  @HttpCode(200)
  @Requires("leads", "edit")
  shortlist(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ShortlistInput)) body: ShortlistInput) {
    return this.units.shortlist(me, id, body);
  }

  /** 14.9 · from the inventory's «List of options»; the service also checks «inventory: view». */
  @Post("options-list")
  @HttpCode(200)
  @Requires("leads", "edit")
  optionsList(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ListOfOptionsInput)) body: ListOfOptionsInput, @Res() res: Response) {
    return sendDoc(res, this.units.listOfOptions(me, id, body));
  }
}
