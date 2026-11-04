import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { UploadRequest } from "@places/contracts";
import { ZodPipe } from "../http/zod.pipe";
import { SignedIn } from "../authz/requires.decorator";
import { Me, type CurrentUser } from "../auth/current-user.decorator";
import { FilesService } from "./files.service";

/**
 * Anyone signed in may upload (every module needs it); what a file is attached to, and who sees it, is decided by the
 * module that attaches it. Here you only ever reach your own uploads.
 */
@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post("uploads") @SignedIn()
  upload(@Me() me: CurrentUser, @Body(new ZodPipe(UploadRequest)) b: UploadRequest) { return this.files.requestUpload(me, b); }

  @Post(":id/complete") @SignedIn() @HttpCode(200)
  complete(@Me() me: CurrentUser, @Param("id") id: string) { return this.files.complete(me, id); }

  @Get(":id/url") @SignedIn()
  url(@Me() me: CurrentUser, @Param("id") id: string) { return this.files.ownDownloadUrl(me, id); }
}
