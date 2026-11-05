import { Body, Controller, Get, HttpCode, Param, Post, Put, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { BulkDecision, BulkExclude, BulkRequest } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { IMPORT_MAX_BYTES, type UploadedSheet } from "../../core/http/import";
import { LeadBulkService } from "./bulk.service";

const sheet = FileInterceptor("file", { limits: { fileSize: IMPORT_MAX_BYTES } });

/** 1.19 «إدخال جماعي»: Telesales sends («leads: import»), Operations decides («leads: approve», M-01 4). */
@Controller("leads/bulk")
export class LeadBulkController {
  constructor(private readonly bulk: LeadBulkService) {}

  @Post("sheet")
  @HttpCode(200)
  @Requires("leads", "import")
  @UseInterceptors(sheet)
  read(@UploadedFile() file: UploadedSheet | undefined) {
    return this.bulk.readSheet(file);
  }

  @Post()
  @Requires("leads", "import")
  send(@Me() me: CurrentUser, @Body(new ZodPipe(BulkRequest)) body: BulkRequest) {
    return this.bulk.send(me, body);
  }

  @Get()
  @Requires("leads", "approve")
  pending() {
    return this.bulk.pending();
  }

  @Put(":id/people/:employeeId")
  @Requires("leads", "approve")
  exclude(@Me() me: CurrentUser, @Param("id") id: string, @Param("employeeId") employeeId: string, @Body(new ZodPipe(BulkExclude)) body: BulkExclude) {
    return this.bulk.setExcluded(me, id, employeeId, body.excluded);
  }

  @Post(":id/decide")
  @HttpCode(200)
  @Requires("leads", "approve")
  decide(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(BulkDecision)) body: BulkDecision) {
    return this.bulk.decide(me, id, body);
  }
}
