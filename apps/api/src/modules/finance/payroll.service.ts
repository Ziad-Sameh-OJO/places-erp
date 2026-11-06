import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { PayrollRunInput, PayrollView } from "@places/contracts";
import {
  ADMIN_SALARIES, ADVANCES_PARENT, SALES_SALARIES, VOUCHER_LABEL, formatEGP, fromDecimal, localDate, monthLabel, monthOf, payRow, payrollLines, salaryLine, toDecimal,
  type Piasters,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { LedgerService } from "./ledger.service";
import { AttendanceService } from "../hr/attendance.service";
import type { Tx } from "./ledger.repository";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const dec = (v: { toFixed(n: number): string } | null | undefined): Piasters => (v ? fromDecimal(v.toFixed(2)) : 0);
const PAY_DAY = "finance.payDay";
const CASH_KINDS = new Set(["treasury", "bank", "wallet"]);

/**
 * M-07 · «المرتبات» (9.14, with 9.3's monthly advance deduction): everyone at once, as one voucher «صرف مرتبات» with
 * one entry (5202 / 5301 → each person's 131xx + the safe / bank). Once a month; every employee hears their net.
 * Attendance + penalty deductions join once HR approves the month (7.9); until then they are 0.
 */
@Injectable()
export class PayrollService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly attendance: AttendanceService,
  ) {}

  private async payDay(tx: Tx | PrismaClient = this.db) {
    const s = await tx.setting.findUnique({ where: { key: PAY_DAY } });
    return typeof s?.value === "number" ? s.value : 1;
  }

  /** Each person's row this month: salary, attendance (0 until HR approves), the advance deduction chosen, net. */
  private async rows(month: string, tx: Tx | PrismaClient = this.db) {
    const [people, holders, plans, approved] = await Promise.all([
      tx.employee.findMany({ where: { user: { status: "ACTIVE" }, salary: { gt: 0 } }, select: { userId: true, name: true, salary: true, user: { select: { roles: { select: { role: { select: { key: true } } } } } } }, orderBy: { name: "asc" } }),
      tx.account.findMany({ where: { parent: { code: ADVANCES_PARENT }, holderId: { not: null }, archivedAt: null }, select: { id: true, holderId: true } }),
      tx.advanceDeduction.findMany({ where: { month: { lte: month } }, orderBy: { month: "desc" } }),
      this.attendance.approvedDeductions(month, tx),
    ]);
    const sums = holders.length ? await tx.journalLine.groupBy({ by: ["accountId"], where: { accountId: { in: holders.map((h) => h.id) } }, _sum: { debit: true, credit: true } }) : [];
    return people.map((p) => {
      const acc = holders.find((h) => h.holderId === p.userId), s = acc ? sums.find((x) => x.accountId === acc.id) : undefined;
      const left = s ? dec(s._sum.debit) - dec(s._sum.credit) : 0;
      // this month's choice, or the latest one before it («الشهر الجاي بيبدأ بنفس الاختيار»)
      const plan = plans.find((x) => x.userId === p.userId);
      const r = payRow({ salary: dec(p.salary), attendance: approved?.get(p.userId) ?? 0, advanceLeft: Math.max(0, left), advancePlan: plan ? dec(plan.amount) : null });
      return { userId: p.userId, name: p.name, line: salaryLine(p.user.roles.map((x) => x.role.key)), advanceLeft: Math.max(0, left), advanceAccountId: acc?.id ?? null, ...r };
    });
  }

  async view(): Promise<PayrollView> {
    const today = localDate(new Date()), month = monthOf(today);
    const [day, rows, run, approved] = await Promise.all([this.payDay(), this.rows(month), this.db.payrollRun.findUnique({ where: { month } }), this.attendance.approvedDeductions(month)]);
    const move = run ? await this.db.treasuryMove.findUnique({ where: { id: run.moveId }, select: { id: true, no: true, from: { select: { name: true } } } }) : null;
    const t = (k: "salary" | "attendance" | "advance" | "net") => toDecimal(rows.reduce((s, r) => s + r[k], 0));
    return {
      month, label: monthLabel(month), payDay: day, deductionsApproved: !!approved, due: !run && Number(today.slice(8, 10)) >= day,
      run: run && move ? { id: run.id, at: run.at.toISOString(), net: toDecimal(dec(run.net)), gross: toDecimal(dec(run.gross)), from: move.from?.name ?? "", move: { id: move.id, no: `MV-${move.no}` } } : null,
      rows: rows.map((r) => ({ userId: r.userId, name: r.name, line: r.line, salary: toDecimal(r.salary), attendance: toDecimal(r.attendance), advanceLeft: toDecimal(r.advanceLeft), advance: toDecimal(r.advance), net: toDecimal(r.net), advanceAccountId: r.advanceAccountId })),
      totals: { salary: t("salary"), attendance: t("attendance"), advance: t("advance"), net: t("net"), people: rows.length },
    };
  }

  async setPayDay(me: CurrentUser, day: number, run: Run) {
    return run(async (tx) => {
      const before = await this.payDay(tx);
      await tx.setting.upsert({ where: { key: PAY_DAY }, create: { key: PAY_DAY, value: day }, update: { value: day } });
      await this.audit.record({ module: "finance", entity: "Setting", entityId: PAY_DAY, action: "update", userId: me.id, before: { day: before }, after: { day } }, tx);
      return { day };
    });
  }

  /** «يتخصم كام الشهر ده» (9.3): not more than what's left on the advance. */
  async planAdvance(me: CurrentUser, userId: string, amount: string, run: Run) {
    return run(async (tx) => {
      const month = monthOf(localDate(new Date()));
      if (await tx.payrollRun.findUnique({ where: { month } })) throw new BadRequestException("مرتبات الشهر ده اتصرفت قبل كده");
      const row = (await this.rows(month, tx)).find((r) => r.userId === userId);
      if (!row) throw new BadRequestException("الموظف ده مالوش مرتب");
      const v = fromDecimal(amount);
      if (v < 0) throw new BadRequestException("المبلغ مايبقاش بالسالب");
      if (v > row.advanceLeft) throw new BadRequestException(`عليه ${formatEGP(row.advanceLeft)} بس`);
      const before = await tx.advanceDeduction.findUnique({ where: { userId_month: { userId, month } } });
      await tx.advanceDeduction.upsert({ where: { userId_month: { userId, month } }, create: { userId, month, amount, byId: me.id }, update: { amount, byId: me.id } });
      await this.audit.record({ module: "finance", entity: "AdvanceDeduction", entityId: `${userId}:${month}`, action: before ? "update" : "create", userId: me.id,
        before: before ? { amount: before.amount.toFixed(2) } : null, after: { amount: toDecimal(v), month } }, tx);
      return { userId, month, amount: toDecimal(v) };
    });
  }

  /** «اصرف المرتبات كلها»: one voucher, one entry; refused twice in a month or above the safe's balance. */
  async run(me: CurrentUser, input: PayrollRunInput, run: Run) {
    const today = localDate(new Date()), month = monthOf(today), date = input.date ?? today;
    const result = await run(async (tx) => {
      if (await tx.payrollRun.findUnique({ where: { month } })) throw new BadRequestException("مرتبات الشهر ده اتصرفت قبل كده");
      const rows = await this.rows(month, tx);
      if (!rows.length) throw new BadRequestException("مفيش مرتبات متسجلة · الـ HR بتدخّلها من فايل الموظف");
      await this.ledger.lockBalances([input.fromId], tx); // a voucher from the same safe at the same moment can't overdraw it
      const { accounts, balance } = await this.ledger.balances(tx);
      const from = accounts.find((a) => a.id === input.fromId);
      if (!from || !from.kind || !CASH_KINDS.has(from.kind)) throw new BadRequestException("اختار الخزنة أو البنك");
      const net = rows.reduce((s, r) => s + r.net, 0), gross = rows.reduce((s, r) => s + r.salary, 0);
      if ((balance.get(from.id) ?? 0) < net) throw new BadRequestException(`الرصيد في ${from.name} (${formatEGP(balance.get(from.id) ?? 0)}) مش كفاية`);
      const code = (c: string) => accounts.find((a) => a.code === c)?.id;
      const admin = code(ADMIN_SALARIES), sales = code(SALES_SALARIES);
      if (!admin || !sales) throw new BadRequestException("حسابات المرتبات (5202 / 5301) مش موجودة في الشجرة");
      const lines = payrollLines(rows.map((r) => ({ ...r, ...(r.advanceAccountId ? { advanceAccount: r.advanceAccountId } : {}) })), { admin, sales, from: from.id });
      const label = monthLabel(month);
      const entry = await this.ledger.post(me, { date, nature: VOUCHER_LABEL.payroll, source: "voucher", memo: `مرتبات ${label} · ${rows.length} موظف`, lines }, tx);
      const move = await tx.treasuryMove.create({ data: { kind: "payroll", date: new Date(`${date}T00:00:00Z`), fromId: from.id, amount: toDecimal(net), party: `${rows.length} موظف`, memo: `مرتبات ${label} · ${rows.length} موظف`, entryId: entry.id, createdById: me.id } });
      await this.ledger.linkEntry(entry.id, move.id, tx);
      const payroll = await tx.payrollRun.create({ data: { month, moveId: move.id, fromId: from.id, gross: toDecimal(gross), net: toDecimal(net), createdById: me.id,
        lines: { create: rows.map((r) => ({ userId: r.userId, name: r.name, line: r.line, salary: toDecimal(r.salary), attendance: toDecimal(r.attendance), advance: toDecimal(r.advance), net: toDecimal(r.net) })) } } });
      // this month's deductions stay recorded as the plan that was applied
      for (const r of rows.filter((x) => x.advance)) await tx.advanceDeduction.upsert({ where: { userId_month: { userId: r.userId, month } }, create: { userId: r.userId, month, amount: toDecimal(r.advance), byId: me.id }, update: { amount: toDecimal(r.advance) } });
      await this.audit.record({ module: "finance", entity: "PayrollRun", entityId: payroll.id, action: "create", userId: me.id, after: { month, from: from.code, gross: toDecimal(gross), net: toDecimal(net), people: rows.length, move: `MV-${move.no}`, entry: entry.no } }, tx);
      return { id: payroll.id, month, move: { id: move.id, no: `MV-${move.no}` }, entry, rows, label };
    });
    // every employee hears their net and what's left on their advance
    for (const r of result.rows) {
      const left = r.advanceLeft - r.advance;
      await this.notifications.notify({ event: "finance.payslip", userIds: [r.userId], link: "/profile",
        text: `اتصرف مرتب ${result.label}: ${formatEGP(r.net)}${r.advance ? ` (اتخصم ${formatEGP(r.advance)} سلفة · باقي عليك ${formatEGP(left)})` : ""}` });
    }
    return { id: result.id, month: result.month, move: result.move, entry: result.entry };
  }
}
