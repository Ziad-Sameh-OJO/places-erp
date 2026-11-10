import { Controller, Get, Query } from "@nestjs/common";
import { SearchQuery } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { SearchService } from "./search.service";

/** 0.17 · GET /search?q=: anyone signed in; what comes back is each module's own «view» and scope (the service). */
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @SignedIn()
  find(@Me() me: CurrentUser, @Query(new ZodPipe(SearchQuery)) f: SearchQuery) {
    return this.search.search(me, f.q);
  }
}
