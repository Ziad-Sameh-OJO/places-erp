import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { BudgetPatch, JournalFilters, MoveFilters, NewAccount, NewMove, OpeningBalances } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { LedgerService } from "./ledger.service";
import { VouchersService } from "./vouchers.service";
import type { Tx } from "./ledger.repository";

/** HTTP only: validate input, check the permission, call the service. M-07 · the chart (9.1), the journal (9.5), vouchers (9.2 · 9.3 · 9.11) and the budget. */
@Controller("finance")
export class FinanceController {
  constructor(private readonly ledger: LedgerService, private readonly vouchers: VouchersService, @Inject(PRISMA) private readonly db: PrismaClient) {}

  private readonly run = <T>(fn: (tx: Tx) => Promise<T>) => this.db.$transaction(fn);

  @Get("accounts")
  @Requires("finance", "view")
  chart() {
    return this.ledger.chart();
  }

  @Get("accounts/:id/ledger")
  @Requires("finance", "view")
  accountLedger(@Param("id") id: string) {
    return this.ledger.ledger(id);
  }

  @Post("accounts")
  @Requires("finance", "create")
  addAccount(@Me() me: CurrentUser, @Body(new ZodPipe(NewAccount)) body: NewAccount) {
    return this.ledger.addAccount(me, body, this.run);
  }

  /** Removing a new, unused account: the accountant's "edit" (his role has no delete — M-09 matrix). */
  @Delete("accounts/:id")
  @Requires("finance", "edit")
  removeAccount(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.ledger.removeAccount(me, id, this.run);
  }

  @Get("journal")
  @Requires("finance", "view")
  journal(@Query(new ZodPipe(JournalFilters)) f: JournalFilters) {
    return this.ledger.journal(f);
  }

  @Get("journal/:id")
  @Requires("finance", "view")
  entry(@Param("id") id: string) {
    return this.ledger.entry(id);
  }

  @Post("opening")
  @Requires("finance", "create")
  opening(@Me() me: CurrentUser, @Body(new ZodPipe(OpeningBalances)) body: OpeningBalances) {
    return this.ledger.opening(me, body, this.run);
  }

  @Get("cash")
  @Requires("finance", "view")
  cash() {
    return this.vouchers.cash();
  }

  @Get("moves")
  @Requires("finance", "view")
  moves(@Query(new ZodPipe(MoveFilters)) f: MoveFilters) {
    return this.vouchers.list(f);
  }

  @Get("moves/:id")
  @Requires("finance", "view")
  move(@Param("id") id: string) {
    return this.vouchers.get(id);
  }

  @Post("moves")
  @Requires("finance", "create")
  addMove(@Me() me: CurrentUser, @Body(new ZodPipe(NewMove)) body: NewMove) {
    return this.vouchers.create(me, body, this.run);
  }

  @Get("budget")
  @Requires("finance", "view")
  budget() {
    return this.vouchers.budget();
  }

  @Patch("budget/:accountId")
  @Requires("finance", "edit")
  setBudget(@Me() me: CurrentUser, @Param("accountId") accountId: string, @Body(new ZodPipe(BudgetPatch)) body: BudgetPatch) {
    return this.vouchers.setBudget(me, accountId, body, this.run);
  }
}
