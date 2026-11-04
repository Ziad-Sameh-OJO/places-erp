import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { JournalFilters, NewAccount, OpeningBalances } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { LedgerService } from "./ledger.service";
import type { Tx } from "./ledger.repository";

/** HTTP only: validate input, check the permission, call the service. M-07 · the chart of accounts (9.1) and the journal (9.5). */
@Controller("finance")
export class FinanceController {
  constructor(private readonly ledger: LedgerService, @Inject(PRISMA) private readonly db: PrismaClient) {}

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
}
