import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { BillView, BillsView, NewBill, SkipBill } from "@places/contracts";
import { BILL_STATE_LABEL, billState, fromDecimal, localDate, monthLabel, monthOf, toDecimal } from "@places/domain";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { LedgerService } from "./ledger.service";
import type { Tx } from "./ledger.repository";
import { VouchersRepository, type BillRow } from "./vouchers.repository";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const CASH_KINDS = new Set(["treasury", "bank", "wallet"]);

/**
 * M-07 · «الفواتير الثابتة» (9.16; the accountant's meeting, 4 Nov): a bill never pays by itself. On its day the job
 * notifies the accountant; «وافق واصرف» is an ordinary payment voucher with `billId` (VouchersService), or «مش الشهر ده» with a reason.
 */
@Injectable()
export class BillsService {
  constructor(private readonly repo: VouchersRepository, private readonly ledger: LedgerService, private readonly audit: AuditService) {}

  async list(): Promise<BillsView> {
    const today = localDate(new Date()), month = monthOf(today);
    const rows = await this.repo.bills();
    const [accounts, moves] = await Promise.all([
      this.repo.accountsByIds([...new Set(rows.flatMap((b) => [b.accountId, b.fromId]))]),
      this.repo.movesByIds(rows.flatMap((b) => b.months.filter((m) => m.month === month && m.moveId).map((m) => m.moveId!))),
    ]);
    const acc = (id: string) => accounts.find((a) => a.id === id) ?? { id, code: "", name: "" };
    const items: BillView[] = rows.map((b) => {
      const m = b.months.find((x) => x.month === month), state = billState(b, (m?.status as "paid" | "skipped" | undefined) ?? null, today);
      const mv = m?.moveId ? moves.find((x) => x.id === m.moveId) : undefined;
      return { id: b.id, name: b.name, vendor: b.vendor, amount: toDecimal(fromDecimal(b.amount.toFixed(2))), day: b.day, active: b.active, account: acc(b.accountId), from: acc(b.fromId),
        state, stateLabel: BILL_STATE_LABEL[state], move: mv ? { id: mv.id, no: `MV-${mv.no}` } : null, reason: m?.reason ?? null };
    });
    return { month, label: monthLabel(month), items, due: items.filter((b) => b.state === "due").length };
  }

  async create(me: CurrentUser, input: NewBill, run: Run) {
    return run(async (tx) => {
      const { accounts } = await this.ledger.balances(tx);
      const parents = new Set(accounts.map((a) => a.parentId));
      const line = accounts.find((a) => a.id === input.accountId), from = accounts.find((a) => a.id === input.fromId);
      if (!line || !line.code.startsWith("5") || parents.has(line.id)) throw new BadRequestException("اختار بند مصروف من الشجرة");
      if (!from || !from.kind || !CASH_KINDS.has(from.kind)) throw new BadRequestException("اختار الخزنة أو البنك");
      if (!(fromDecimal(input.amount) > 0)) throw new BadRequestException("المبلغ لازم يبقى أكبر من صفر");
      const bill = await this.repo.createBill({ ...input, createdById: me.id }, tx);
      await this.audit.record({ module: "finance", entity: "RecurringBill", entityId: bill.id, action: "create", userId: me.id, after: { ...input } }, tx);
      return { id: bill.id };
    });
  }

  async setActive(me: CurrentUser, id: string, active: boolean, run: Run) {
    return run(async (tx) => {
      const b = await this.found(id, tx);
      await this.repo.setBillActive(id, active, tx);
      await this.audit.record({ module: "finance", entity: "RecurringBill", entityId: id, action: "update", userId: me.id, before: { active: b.active }, after: { active } }, tx);
      return { id, active };
    });
  }

  /** «مش الشهر ده»: the reason is kept; the bill comes back next month. */
  async skip(me: CurrentUser, id: string, input: SkipBill, run: Run) {
    return run(async (tx) => {
      const b = await this.found(id, tx), month = monthOf(localDate(new Date()));
      if (b.months.some((m) => m.month === month)) throw new BadRequestException("الفاتورة دي اتقفلت الشهر ده خلاص");
      await this.repo.markBill({ billId: id, month, status: "skipped", reason: input.reason, byId: me.id }, tx);
      await this.audit.record({ module: "finance", entity: "RecurringBill", entityId: id, action: "skip", userId: me.id, after: { month, reason: input.reason } }, tx);
      return { id, month };
    });
  }

  private async found(id: string, tx: Tx): Promise<BillRow> {
    const b = await this.repo.bill(id, tx);
    if (!b) throw new NotFoundException("الفاتورة مش موجودة");
    return b;
  }
}
