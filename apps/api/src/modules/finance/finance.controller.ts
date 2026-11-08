import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { sendXlsx } from "../../core/http/excel";
import { BillsService } from "./bills.service";
import { PayrollService } from "./payroll.service";
import type { PrismaClient } from "@places/db";
import { AdvancePlan, BudgetPatch, type BudgetRow, ClosePeriod, IncomeQuery, PayDay, PayrollRunInput, JournalFilters, ManualEntry, NewBill, NewBudgetLine, SkipBill, MoveFilters, NewAccount, NewMove, OpeningBalances } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";
import { DocumentsService, sendPdf } from "../../core/documents/documents.service";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { LedgerService } from "./ledger.service";
import { VouchersService } from "./vouchers.service";
import type { Tx } from "./ledger.repository";
import { blankHidden, keepFixedEntry, notYours } from "./hidden-fields";

const AMOUNT = "المبلغ";
/** M-09: what the person may not see / change in the accounts. */
const hidden = (me: CurrentUser) => me.fields.hidden("finance");
const fixed = (me: CurrentUser) => me.fields.fixed("finance");
const show = <T>(me: CurrentUser, v: T): T => blankHidden(v, hidden(me));

/** HTTP only: validate input, check the permission, call the service. M-07 · the chart (9.1), the journal (9.5), vouchers (9.2 · 9.3 · 9.11) and the budget. */
@Controller("finance")
export class FinanceController {
  constructor(private readonly ledger: LedgerService, private readonly vouchers: VouchersService, private readonly bills: BillsService, private readonly payroll: PayrollService, private readonly docs: DocumentsService, @Inject(PRISMA) private readonly db: PrismaClient) {}

  private readonly run = <T>(fn: (tx: Tx) => Promise<T>) => this.db.$transaction(fn);

  @Get("accounts")
  @Requires("finance", "view")
  async chart(@Me() me: CurrentUser) {
    return show(me, await this.ledger.chart());
  }

  @Get("accounts/:id/ledger")
  @Requires("finance", "view")
  async accountLedger(@Me() me: CurrentUser, @Param("id") id: string) {
    return show(me, await this.ledger.ledger(id));
  }

  @Post("accounts")
  @Requires("finance", "create")
  addAccount(@Me() me: CurrentUser, @Body(new ZodPipe(NewAccount)) body: NewAccount) {
    // a read-only «المبلغ»: the account opens without an opening balance
    const { opening, ...rest } = body;
    return this.ledger.addAccount(me, fixed(me).has("amount") || !opening ? rest : { ...rest, opening }, this.run);
  }

  /** Removing a new, unused account: the accountant's "edit" (his role has no delete — M-09 matrix). */
  @Delete("accounts/:id")
  @Requires("finance", "edit")
  removeAccount(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.ledger.removeAccount(me, id, this.run);
  }

  @Get("journal")
  @Requires("finance", "view")
  async journal(@Me() me: CurrentUser, @Query(new ZodPipe(JournalFilters)) f: JournalFilters) {
    // searching a hidden «البيان» would tell what it says
    const { q, ...rest } = f;
    return show(me, await this.ledger.journal(hidden(me).has("memo") || !q ? rest : { ...rest, q }));
  }

  @Get("journal/:id")
  @Requires("finance", "view")
  async entry(@Me() me: CurrentUser, @Param("id") id: string) {
    return show(me, await this.ledger.entry(id));
  }

  @Post("opening")
  @Requires("finance", "create")
  opening(@Me() me: CurrentUser, @Body(new ZodPipe(OpeningBalances)) body: OpeningBalances) {
    if (fixed(me).has("amount")) throw notYours(AMOUNT);
    return this.ledger.opening(me, body, this.run);
  }

  @Get("cash")
  @Requires("finance", "view")
  async cash(@Me() me: CurrentUser) {
    return show(me, await this.vouchers.cash());
  }

  @Get("moves")
  @Requires("finance", "view")
  async moves(@Me() me: CurrentUser, @Query(new ZodPipe(MoveFilters)) f: MoveFilters) {
    return show(me, await this.vouchers.list(f));
  }

  @Get("moves/:id")
  @Requires("finance", "view")
  async move(@Me() me: CurrentUser, @Param("id") id: string) {
    return show(me, await this.vouchers.get(id));
  }

  @Get("moves/:id/pdf")
  @Requires("finance", "view")
  async movePdf(@Me() me: CurrentUser, @Param("id") id: string, @Res() res: Response) {
    const { name, html } = await this.vouchers.pdf(id, hidden(me));
    sendPdf(res, name, await this.docs.pdf(html));
  }

  @Post("moves")
  @Requires("finance", "create")
  async addMove(@Me() me: CurrentUser, @Body(new ZodPipe(NewMove)) body: NewMove) {
    const f = fixed(me);
    if (f.has("amount")) throw notYours(AMOUNT);
    // a field the person may not set starts empty
    const { party, ref, ...rest } = body;
    const input: NewMove = { ...rest, memo: f.has("memo") ? "" : body.memo, ...(party && !f.has("party") ? { party } : {}), ...(ref && !f.has("ref") ? { ref } : {}) };
    return show(me, await this.vouchers.create(me, input, this.run));
  }

  @Get("budget")
  @Requires("finance", "view")
  async budget(@Me() me: CurrentUser) {
    return show(me, await this.vouchers.budget());
  }

  // before budget/:accountId
  @Get("budget/export")
  @Requires("finance", "export")
  async exportBudget(@Me() me: CurrentUser, @Res() res: Response) {
    const PERIOD: Record<string, string> = { month: "شهري", quarter: "ربع سنوي", year: "سنوي" };
    const money = !hidden(me).has("amount"); // a hidden «المبلغ»: no money columns at all
    await sendXlsx(res, "البادجت.xlsx", [
      { header: "الكود", value: (r) => r.code }, { header: "البند", value: (r) => r.name, width: 28 }, { header: "تحت", value: (r) => r.group, width: 20 },
      ...(money ? [{ header: "البادجت", value: (r: BudgetRow) => (r.budget ? Number(r.budget) : null) }] : []), { header: "الفترة", value: (r) => PERIOD[r.period] },
      ...(money ? [{ header: "اتصرف", value: (r: BudgetRow) => Number(r.spent) }, { header: "فاضل", value: (r: BudgetRow) => (r.left ? Number(r.left) : null) }, { header: "%", value: (r: BudgetRow) => r.pct }] : []),
      { header: "التنبيه %", value: (r) => r.alert }, { header: "المسؤول", value: (r) => r.owner?.name }, { header: "شغّال", value: (r) => (r.active ? "اه" : "لأ") },
    ], show(me, await this.vouchers.budgetRows()), "البادجت");
  }

  @Post("budget")
  @Requires("finance", "edit")
  newBudgetLine(@Me() me: CurrentUser, @Body(new ZodPipe(NewBudgetLine)) body: NewBudgetLine) {
    if (fixed(me).has("amount")) throw notYours(AMOUNT);
    return this.vouchers.newBudgetLine(me, body, this.run);
  }

  @Patch("budget/:accountId")
  @Requires("finance", "edit")
  setBudget(@Me() me: CurrentUser, @Param("accountId") accountId: string, @Body(new ZodPipe(BudgetPatch)) body: BudgetPatch) {
    const { budget, ...rest } = body; // a read-only «المبلغ» keeps the budget as it is
    return this.vouchers.setBudget(me, accountId, fixed(me).has("amount") || budget === undefined ? rest : { ...rest, budget }, this.run);
  }

  @Post("journal")
  @Requires("finance", "create")
  async manual(@Me() me: CurrentUser, @Body(new ZodPipe(ManualEntry)) body: ManualEntry) {
    if (fixed(me).has("amount")) throw notYours(AMOUNT);
    return show(me, await this.ledger.manual(me, fixed(me).has("memo") ? { ...body, memo: "" } : body, this.run));
  }

  /** M-07 (43): editing a posted manual entry is for whoever holds finance «approve». */
  @Put("journal/:id")
  @Requires("finance", "approve")
  async editManual(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(ManualEntry)) body: ManualEntry) {
    const f = fixed(me);
    const input = f.has("amount") || f.has("memo") ? keepFixedEntry(body, await this.ledger.entry(id), f) : body;
    return show(me, await this.ledger.editManual(me, id, input, this.run));
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
  async billList(@Me() me: CurrentUser) {
    return show(me, await this.bills.list());
  }

  @Post("bills")
  @Requires("finance", "create")
  addBill(@Me() me: CurrentUser, @Body(new ZodPipe(NewBill)) body: NewBill) {
    if (fixed(me).has("amount")) throw notYours(AMOUNT);
    return this.bills.create(me, fixed(me).has("vendor") ? { ...body, vendor: "" } : body, this.run);
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

  @Get("statements/income")
  @Requires("finance", "view")
  async income(@Me() me: CurrentUser, @Query(new ZodPipe(IncomeQuery)) q: IncomeQuery) {
    return show(me, await this.ledger.income(q.range));
  }

  @Get("payroll")
  @Requires("finance", "view")
  async payrollView(@Me() me: CurrentUser) {
    return show(me, await this.payroll.view());
  }

  @Patch("payroll/day")
  @Requires("finance", "edit")
  payDay(@Me() me: CurrentUser, @Body(new ZodPipe(PayDay)) body: { day: number }) {
    return this.payroll.setPayDay(me, body.day, this.run);
  }

  @Put("payroll/advances/:userId")
  @Requires("finance", "create")
  planAdvance(@Me() me: CurrentUser, @Param("userId") userId: string, @Body(new ZodPipe(AdvancePlan)) body: { amount: string }) {
    if (fixed(me).has("amount")) throw notYours(AMOUNT);
    return this.payroll.planAdvance(me, userId, body.amount, this.run);
  }

  @Post("payroll/run")
  @Requires("finance", "create")
  payrollRun(@Me() me: CurrentUser, @Body(new ZodPipe(PayrollRunInput)) body: PayrollRunInput) {
    return this.payroll.run(me, body, this.run);
  }
}
