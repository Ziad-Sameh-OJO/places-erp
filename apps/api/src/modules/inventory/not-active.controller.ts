import { Body, Controller, Get, HttpCode, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Id, NotActiveImport, NotActiveRowFilters } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { IMPORT_MAX_BYTES, readTable, type UploadedSheet } from "../../core/http/import";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { NotActiveService } from "./not-active.service";

const sheet = FileInterceptor("file", { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } });

/** HTTP only (2.14): the sheets and their rows for whoever has «Not Active», uploading for «import» (Manar). */
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
  rows(@Param("id", new ZodPipe(Id)) id: string, @Query(new ZodPipe(NotActiveRowFilters)) f: NotActiveRowFilters) {
    return this.notActive.rows(id, f);
  }

  /** Step 1: the file's columns and rows, and what merging it would add; nothing saved. */
  @Post("preview")
  @HttpCode(200)
  @Requires("notactive", "import")
  @UseInterceptors(sheet)
  async preview(@UploadedFile() file: UploadedSheet | undefined, @Body(new ZodPipe(NotActiveImport.partial())) body: Partial<NotActiveImport>) {
    return this.notActive.preview(await readTable(file), body.name, body.dedupeBy);
  }

  /** Step 2 («ادمج»): the same file again with the name and the column. */
  @Post("import")
  @HttpCode(200)
  @Requires("notactive", "import")
  @UseInterceptors(sheet)
  async import(@Me() me: CurrentUser, @UploadedFile() file: UploadedSheet | undefined, @Body(new ZodPipe(NotActiveImport)) body: NotActiveImport) {
    return this.notActive.import(me, await readTable(file), body, file?.originalname ?? "");
  }
}
