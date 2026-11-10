import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { PostInput, PostMediaInput, PostQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { PostsService } from "./posts.service";

/** HTTP only. The Content plan is marketing's (M-04 4.1); approving a post is the manager's (2.2). */
@Controller("marketing/posts")
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  @Requires("marketing", "view")
  list(@Query(new ZodPipe(PostQuery)) q: PostQuery) {
    return this.posts.list(q);
  }

  @Post()
  @Requires("marketing", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(PostInput)) body: PostInput) {
    return this.posts.create(me, body);
  }

  /** 4.21 · the post's design / video. */
  @Get(":id/media")
  @Requires("marketing", "view")
  media(@Param("id") id: string) {
    return this.posts.media(id);
  }

  /** «ضيف صورة / فيديو», and the files picked in the new-post form. */
  @Post(":id/media")
  @Requires("marketing", "create")
  addMedia(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(PostMediaInput)) body: PostMediaInput) {
    return this.posts.addMedia(me, id, body.fileIds);
  }

  @Delete(":id/media/:fileId")
  @HttpCode(204)
  @Requires("marketing", "create")
  removeMedia(@Me() me: CurrentUser, @Param("id") id: string, @Param("fileId") fileId: string) {
    return this.posts.removeMedia(me, id, fileId);
  }

  @Post(":id/approve")
  @HttpCode(204)
  @Requires("marketing", "approve")
  approve(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.posts.approve(me, id);
  }

  @Post(":id/published")
  @HttpCode(204)
  @Requires("marketing", "edit")
  published(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.posts.published(me, id);
  }

  @Delete(":id")
  @HttpCode(204)
  @Requires("marketing", "delete")
  archive(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.posts.archive(me, id);
  }
}
