import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { DecideMerge, SuggestMerge } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ClientMergesService } from "./client-merges.service";

/** M-10 2.2: suggesting a merge is editing files; deciding it is Operations' approval. HTTP only. */
@Controller("clients")
export class ClientMergesController {
  constructor(private readonly merges: ClientMergesService) {}

  @Get("merges")
  @Requires("clients", "approve")
  pending() {
    return this.merges.pending();
  }

  @Post("merges/:id")
  @HttpCode(204)
  @Requires("clients", "approve")
  decide(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(DecideMerge)) body: DecideMerge) {
    return this.merges.decide(me, id, body);
  }

  @Post(":id/merges")
  @Requires("clients", "edit")
  suggest(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(SuggestMerge)) body: SuggestMerge) {
    return this.merges.suggest(me, id, body);
  }
}
