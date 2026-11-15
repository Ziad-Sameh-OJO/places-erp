import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { HistoricalFigureInput, HistoryQuery, periodOf } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { HistoryService } from "./history.service";

/**
 * 14.12 · past quarters' figures typed by hand. @SignedIn like the rest of the KPIs: the admins (kpis: edit) and HR
 * (hr: edit) hold different grants, so the service checks either.
 */
@Controller("kpis/history")
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  @SignedIn()
  list(@Me() me: CurrentUser, @Query(new ZodPipe(HistoryQuery)) q: HistoryQuery) {
    return this.history.list(me, periodOf(q)!);
  }

  @Post()
  @SignedIn()
  save(@Me() me: CurrentUser, @Body(new ZodPipe(HistoricalFigureInput)) body: HistoricalFigureInput) {
    return this.history.save(me, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @SignedIn()
  remove(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.history.remove(me, id);
  }
}
