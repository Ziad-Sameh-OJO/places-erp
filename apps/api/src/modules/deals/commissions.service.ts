import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CommissionPaid, CommissionPerson, CommissionStatement, PayCommission } from "@places/contracts";
import { formatEGP, fromDecimal, payoutDue, payoutProblem, payoutState, splitDeal, tcrCode, toDecimal, type Piasters } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { LedgerService } from "../finance/ledger.service";
import { VouchersService } from "../finance/vouchers.service";
import { DealsRepository } from "./deals.repository";
import { toMoney } from "./deals.service";

const dec = (v: { toFixed(n: number): string }): Piasters => fromDecimal(v.toFixed(2));

/**
 * M-07 9.15 (the accountant's meeting, 4 Nov): «كشف عمولة» per salesperson and «صرف عمولة سيلز» — on one fully collected
 * deal against the TCR they sign, or a Team Leader's commission without a deal (5.8) — Dr their 21103 account / Cr the safe.
 */
@Injectable()
export class CommissionsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: DealsRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly ledger: LedgerService,
    private readonly vouchers: VouchersService,
  ) {}

  /** «صرف عمولة سيلز»'s picker: everyone with a 21103 account and what's owed to them. */
  async people(): Promise<CommissionPerson[]> {
    const [accounts, { balance }] = await Promise.all([this.repo.commissionAccounts(), this.ledger.balances()]);
    return accounts.map((a) => ({ employeeId: a.partyId!, name: a.name, code: a.code, balance: toDecimal(balance.get(a.id) ?? 0) }));
  }

  async statement(employeeId: string): Promise<CommissionStatement> {
    const [emp] = await this.repo.employeeNames([employeeId]);
    if (!emp) throw new NotFoundException("الموظف مش موجود");
    const [{ rows, balance, tlDue }, payouts] = await Promise.all([this.dues(employeeId, this.db), this.repo.payouts(employeeId)]);
    const moves = await Promise.all(payouts.map((p) => this.vouchers.get(p.moveId)));
    return {
      employee: { id: emp.id, name: emp.name }, balance: toDecimal(balance), tlDue: toDecimal(Math.max(0, tlDue)),
      deals: rows.map(({ due, ...r }) => ({ ...r, due: toDecimal(due) })),
      payouts: payouts.map((p, i) => ({ id: p.id, moveId: p.moveId, move: moves[i]!.no, date: moves[i]!.date, deal: p.deal?.code ?? null, tcr: p.tcr ? tcrCode(p.tcr.code) : null, amount: p.amount.toFixed(2) })),
    };
  }

  async pay(me: CurrentUser, input: PayCommission): Promise<CommissionPaid> {
    const amount = fromDecimal(input.amount);
    const out = await this.db.$transaction(async (tx) => {
      // one payout per person at a time, and none while the deal is being cancelled or collected
      await this.repo.lockKey(tx, `commission-payout:${input.employeeId}`);
      if (input.dealId) await this.repo.lock(tx, input.dealId);
      const [emp] = await this.repo.employeeNames([input.employeeId]);
      if (!emp) throw new BadRequestException("اختار السيلز");
      const { rows, balance, tlDue, account } = await this.dues(input.employeeId, tx);
      const row = input.dealId ? rows.find((r) => r.dealId === input.dealId) : undefined;
      if (input.dealId && !row) throw new BadRequestException("الصفقة دي مش من صفقاته");
      const tcr = input.tcrId ? row?.tcrs.find((t) => t.id === input.tcrId) : undefined;
      if (input.tcrId && !tcr) throw new BadRequestException("الـ TCR دي مش عليه في الصفقة دي");
      const due = row ? row.due : tlDue;
      const problem = payoutProblem(due, balance, amount);
      if (problem) throw new BadRequestException(problem);
      const what = row ? `على ${row.code}` : "(Team Leader)";
      const move = await this.vouchers.recordCommissionPayout(me, {
        fromId: input.fromId, accountId: account!.id, amount, party: emp.name, partyId: emp.userId, ...(row ? { ref: tcr ? `${row.code} · ${tcr.code}` : row.code } : {}),
        memo: input.memo || `عمولة ${emp.name} ${what}`, date: input.date,
      }, tx);
      const payout = await this.repo.addPayout(tx, { employeeId: emp.id, dealId: row?.dealId ?? null, tcrId: tcr?.id ?? null, amount: toDecimal(amount), moveId: move.id, createdById: me.id });
      await this.audit.record({ module: "deals", entity: "CommissionPayout", entityId: payout.id, action: "create", userId: me.id,
        after: { employeeId: emp.id, deal: row?.code ?? null, tcr: tcr?.code ?? null, amount: toDecimal(amount), move: move.no, entry: move.entry, summary: `صرف عمولة ${emp.name} ${what}` } }, tx);
      return { userId: emp.userId, what, tcr, result: { moveId: move.id, move: move.no, entry: move.entry, due: toDecimal(due - amount), signed: tcr ? tcr.signed : null } };
    });
    const sign = out.tcr && !out.tcr.signed ? ` · امضي على ${out.tcr.code}` : "";
    await this.notifications.notify({ event: "finance.commission_paid", userIds: [out.userId], link: "/deals", text: `اتصرفتلك عمولة ${formatEGP(amount)} ${out.what} · ${out.result.move}${sign}` });
    return out.result;
  }

  /** Each deal's due (commission once fully collected − paid on it), his 21103 balance, and what's left of it outside the deals: the TL's part. */
  private async dues(employeeId: string, tx: Prisma.TransactionClient) {
    const [deals, payouts, { account, balance }] = await Promise.all([
      this.repo.commissionDeals(employeeId, tx), this.repo.payouts(employeeId, tx), this.ledger.partyBalance("sales", employeeId, tx),
    ]);
    const ids = [...new Set(deals.flatMap((d) => d.participants.map((p) => p.employee.id)))];
    const schemes = new Map((await this.repo.schemes(ids, tx)).map((e) => [e.id, Number(e.commissionPct ?? 0)]));
    const schemeOf = (id: string) => schemes.get(id) ?? 0;
    const rows = deals.flatMap((d) => {
      const money = toMoney(d, d.payments);
      const shares = splitDeal(money, schemeOf).filter((s) => s.salesId === employeeId);
      if (!shares.length) return []; // a Seller still waiting for Manar (5.4)
      const paid = payouts.filter((p) => p.dealId === d.id).reduce((s, p) => s + dec(p.amount), 0);
      const due = payoutDue(money, employeeId, schemeOf, paid);
      return [{
        dealId: d.id, code: d.code, company: d.company, unitCode: d.unit.code, placesCommission: toDecimal(money.commissionOwner + money.commissionClient), status: money.status,
        state: payoutState(money, due), shares: shares.map((s) => ({ side: s.side, schemePercent: s.schemePercent, share: toDecimal(s.share) })),
        commission: toDecimal(shares.reduce((a, s) => a + s.commission, 0)), paid: toDecimal(paid), due,
        tcrs: d.tcrs.flatMap((t) => {
          const mine = t.signatures.find((s) => s.employeeId === employeeId);
          return mine ? [{ id: t.id, code: tcrCode(t.code), amount: t.payment.amount.toFixed(2), side: t.payment.side as "owner" | "client", signed: !!mine.signedAt }] : [];
        }),
      }];
    });
    return { rows, balance, account, tlDue: balance - rows.reduce((s, r) => s + r.due, 0) };
  }
}
