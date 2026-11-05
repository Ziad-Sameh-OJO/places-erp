import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CompanyFilters, NewCompany, PendingCompanyAdd } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { CompaniesService } from "./companies.service";

const NamesQuery = z.object({ q: z.string().trim().max(120).default("") });

/**
 * 1.20 «شيت الشركات»: whoever handles leads' sheets («leads: import» — Telesales, Operations) sees it; adding is
 * Telesales' (checked in the service, M-01 2.1). The new-lead form's suggestions only need «leads: create».
 */
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @Requires("leads", "import")
  sheet(@Me() me: CurrentUser, @Query(new ZodPipe(CompanyFilters)) f: CompanyFilters) {
    return this.companies.sheet(me, f);
  }

  @Get("names")
  @Requires("leads", "create")
  names(@Query(new ZodPipe(NamesQuery)) q: z.infer<typeof NamesQuery>) {
    return this.companies.names(q.q);
  }

  @Post()
  @Requires("leads", "import")
  add(@Me() me: CurrentUser, @Body(new ZodPipe(NewCompany)) body: NewCompany) {
    return this.companies.add(me, body);
  }

  @Get("pending")
  @Requires("leads", "import")
  pending(@Me() me: CurrentUser) {
    return this.companies.pending(me);
  }

  @Post("pending/:id")
  @Requires("leads", "import")
  addPending(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(PendingCompanyAdd)) body: PendingCompanyAdd) {
    return this.companies.addPending(me, id, body.category);
  }
}
