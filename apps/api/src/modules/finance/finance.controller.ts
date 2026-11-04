import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { sendXlsx } from "../../core/http/excel";
import { BillsService } from "./bills.service";
import type { PrismaClient } from "@places/db";
import { BudgetPatch, ClosePeriod, JournalFilters, ManualEntry, NewBill, NewBudgetLine, SkipBill, MoveFilters, NewAccount, NewMove, OpeningBalances } from "@places/contracts";
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
  constructor(private readonly ledger: LedgerService, private readonly vouchers: VouchersService, private readonly bills: BillsService, @Inject(PRISMA) private readonly db: PrismaClient) {}

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

  // before budget/:accountId
  @Get("budget/export")
  @Requires("finance", "export")
  async exportBudget(@Res() res: Response) {
    const PERIOD: Record<string, string> = { month: "شهري", quarter: "ربع سنوي", year: "سنوي" };
    await sendXlsx(res, "البادجت.xlsx", [
      { header: "الكود", value: (r) => r.code }, { header: "البند", value: (r) => r.name, width: 28 }, { header: "تحت", value: (r) => r.group, width: 20 },
      { header: "البادجت", value: (r) => (r.budget ? Number(r.budget) : null) }, { header: "الفترة", value: (r) => PERIOD[r.period] },
      { header: "اتصرف", value: (r) => Number(r.spent) }, { header: "فاضل", value: (r) => (r.left ? Number(r.left) : null) }, { header: "%", value: (r) => r.pct },
      { header: "التنبيه %", value: (r) => r.alert }, { header: "المسؤول", value: (r) => r.owner?.name }, { header: "شغّال", value: (r) => (r.active ? "اه" : "لأ") },
    ], await this.vouchers.budgetRows(), "البادجت");
  }

  @Post("budget")
  @Requires("finance", "edit")
  newBudgetLine(@Me() me: CurrentUser, @Body(new ZodPipe(NewBudgetLine)) body: NewBudgetLine) {
    return this.vouchers.newBudgetLine(me, body, this.run);
  }

  @Patch("budget/:accountId")
  @Requires("finance", "edit")
  setBudget(@Me() me: CurrentUser, @Param("accountId") accountId: string, @Body(new ZodPipe(BudgetPatch)) body: BudgetPatch) {
    return this.vouchers.setBudget(me, accountId, body, this.run);
  }

  @Post("journal")
  @Requires("finance", "create")
  manual(@Me() me: CurrentUser, @Body(new ZodPipe(ManualEntry)) body: ManualEntry) {
    return this.ledger.manual(me, body, this.run);
  }

  /** M-07 (43): editing a posted manual entry is for whoever holds finance «approve». */
  @Put("journal/:id")
  @Requires("finance", "approve")
  editManual(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ManualEntry)) body: ManualEntry) {
    return this.ledger.editManual(me, id, body, this.run);
  }

  @Get("periods")
  @Requires("finance", "view")
  periods() {
    return this.ledger.periods();
  }

  @Post("periods/close")
  @Requires("finance", "approve")
  closePeriod(@Me() me: CurrentUser, @Body(new ZodPipe(ClosePeriod)) body: ClosePeriod) {
    return this.ledger.closePeriod(me, body.kind, this.run);
  }

  @Get("bills")
  @Requires("finance", "view")
  billList() {
    return this.bills.list();
  }

  @Post("bills")
  @Requires("finance", "create")
  addBill(@Me() me: CurrentUser, @Body(new ZodPipe(NewBill)) body: NewBill) {
    return this.bills.create(me, body, this.run);
  }

  @Patch("bills/:id")
  @Requires("finance", "edit")
  toggleBill(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(z.object({ active: z.boolean() }))) body: { active: boolean }) {
    return this.bills.setActive(me, id, body.active, this.run);
  }

  @Post("bills/:id/skip")
  @Requires("finance", "create")
  skipBill(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(SkipBill)) body: SkipBill) {
    return this.bills.skip(me, id, body, this.run);
  }
}
