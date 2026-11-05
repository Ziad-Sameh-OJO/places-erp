import { Body, Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { CompanyFilters, NewCompany, PendingCompanyAdd, type CompanyRow } from "@places/contracts";
import { sendXlsx, type ExcelColumn } from "../../core/http/excel";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { CompaniesService } from "./companies.service";

/** The report's columns: the sheet's own, then the category (demo). */
const REPORT: ExcelColumn<CompanyRow>[] = [
  ["feedback", "feedback"], ["name", "company name"], ["number", "number"], ["contactName", "name"], ["contactTitle", "title"], ["email", "email"],
  ["currentLocation", "current location"], ["currentSpace", "current space"], ["contractStart", "start contract date"], ["contractEnd", "end contract date"],
  ["averageRent", "average current price rent"], ["annualEscalation", "annual escalation"], ["date", "date"], ["category", "category"],
].map(([k, header]) => ({ header: header!, value: (r: CompanyRow) => r[k as keyof CompanyRow], width: 18 }));

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

  /** 1.21 · the report as Excel: who may export the leads' data. */
  @Get("export")
  @Requires("leads", "export")
  async export(@Me() me: CurrentUser, @Query(new ZodPipe(CompanyFilters)) f: CompanyFilters, @Res() res: Response) {
    await sendXlsx(res, f.endingWithin ? "شركات عقدها قرّب يخلص.xlsx" : "شيت الشركات.xlsx", REPORT, await this.companies.exportRows(me, f));
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
