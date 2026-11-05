import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Id, NotActiveAssign, NotActiveClassify, NotActiveImport, NotActiveRowFilters, UnitInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { IMPORT_MAX_BYTES, readTable, type UploadedSheet } from "../../core/http/import";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { NotActiveService } from "./not-active.service";

const sheet = FileInterceptor("file", { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } });

/**
 * HTTP only (2.14 · 2.15): the sheets and their rows for whoever has «Not Active» (Marwa: the rows sent to her, the
 * service decides), uploading for «import», sending rows as a task for «approve» (Manar), classifying for «edit».
 */
@Controller("not-active")
export class NotActiveController {
  constructor(private readonly notActive: NotActiveService) {}

  @Get("sheets")
  @Requires("notactive", "view")
  sheets() {
    return this.notActive.sheets();
  }

  @Get("sheets/:id/rows")
  @Requires("notactive", "view")
  rows(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Query(new ZodPipe(NotActiveRowFilters)) f: NotActiveRowFilters) {
    return this.notActive.rows(me, id, f);
  }

  @Get("sheets/:id/counts")
  @Requires("notactive", "view")
  counts(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string) {
    return this.notActive.counts(me, id);
  }

  /** Who rows can be sent to. */
  @Get("assignees")
  @Requires("notactive", "approve")
  assignees() {
    return this.notActive.assignees();
  }

  /** The unit form's lists, for Done. */
  @Get("unit-options")
  @Requires("notactive", "edit")
  unitOptions() {
    return this.notActive.unitOptions();
  }

  /** Step 1: the file's columns and rows, and what merging it would add; nothing saved. */
  @Post("preview")
  @HttpCode(200)
  @Requires("notactive", "import")
  @UseInterceptors(sheet)
  async preview(@UploadedFile() file: UploadedSheet | undefined, @Body(new ZodPipe(NotActiveImport.partial())) body: Partial<NotActiveImport>) {
    return this.notActive.preview(await readTable(file), body.name, body.dedupeBy);
  }

  /** Step 2 («ادمج»): the same file again with the name and the columns. */
  @Post("import")
  @HttpCode(200)
  @Requires("notactive", "import")
  @UseInterceptors(sheet)
  async import(@Me() me: CurrentUser, @UploadedFile() file: UploadedSheet | undefined, @Body(new ZodPipe(NotActiveImport)) body: NotActiveImport) {
    return this.notActive.import(me, await readTable(file), body, file?.originalname ?? "");
  }

  /** «ابعتهم Task لمروة». */
  @Post("sheets/:id/assign")
  @HttpCode(200)
  @Requires("notactive", "approve")
  assign(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Body(new ZodPipe(NotActiveAssign)) body: NotActiveAssign) {
    return this.notActive.assign(me, id, body);
  }

  /** No Answer / Not True (+ feedback); Manar's status for a number already in the inventory. */
  @Put("rows/:id/status")
  @Requires("notactive", "edit")
  classify(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Body(new ZodPipe(NotActiveClassify)) body: NotActiveClassify) {
    return this.notActive.classify(me, id, body);
  }

  /** Done: the new unit from this number. */
  @Post("rows/:id/done")
  @Requires("notactive", "edit")
  done(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Body(new ZodPipe(UnitInput)) body: UnitInput) {
    return this.notActive.done(me, id, body);
  }
}
