import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ContractFilters, ContractMonth, CreateContract } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ContractsService } from "./contracts.service";

/** HTTP only (M-11): validate, check the permission, call the service. */
@Controller("contracts")
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @Requires("contracts", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(ContractFilters)) f: ContractFilters) {
    return this.contracts.list(me, f);
  }

  // before ":id", so these aren't read as a contract id
  @Get("summary")
  @Requires("contracts", "view")
  summary(@Me() me: CurrentUser) {
    return this.contracts.summary(me);
  }

  @Get("calendar")
  @Requires("contracts", "view")
  calendar(@Me() me: CurrentUser, @Query(new ZodPipe(ContractMonth)) q: ContractMonth) {
    return this.contracts.calendar(me, q.month);
  }

  @Get("form")
  @Requires("contracts", "create")
  form(@Me() me: CurrentUser) {
    return this.contracts.form(me);
  }

  @Get(":id")
  @Requires("contracts", "view")
  get(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.contracts.get(me, id);
  }

  @Get(":id/file")
  @Requires("contracts", "view")
  file(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.contracts.fileUrl(me, id);
  }

  /** M-11 4.1: the salesperson uploads the contract («contracts: create»). */
  @Post()
  @Requires("contracts", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(CreateContract)) body: CreateContract) {
    return this.contracts.create(me, body);
  }
}
