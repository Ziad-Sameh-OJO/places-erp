import { Injectable } from "@nestjs/common";
import type { Prisma } from "@places/db";
import type { DealExportQuery, DealSheet, DealSheetRow, DealsToCollect } from "@places/contracts";
import { awaitsCollection, collected, collectedFrom, countsAsRevenue, countsInTarget, dealRowOf, placesCommission, remaining, revenueBoard, splitDeal, toDecimal } from "@places/domain";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { VouchersService } from "../finance/vouchers.service";
import { TargetsService } from "../kpis/targets.service";
import { type DealSheetRecord, DealSheetRepository } from "./deal-sheet.repository";
import { toRow } from "./deals.service";
import { hideSheetRow, hideTotals } from "./deal-fields";

const money = (d: DealSheetRecord) => dealRowOf({
  ...d, commissionOwner: d.commissionOwner.toFixed(2), commissionClient: d.commissionClient.toFixed(2), targetBase: d.targetBase?.toFixed(2) ?? null,
  payments: d.payments.map((p) => ({ ...p, amount: p.amount.toFixed(2) })),
});

/** «لما توافق عليها تبان وتتسجل في الشيت» (the web's onSheet): everything but Pending Review and Rejected. */
const ON_SHEET = ["APPROVED", "PARTIALLY_COLLECTED", "FULLY_COLLECTED", "CANCELLED"];

/**
 * M-02 · what the deals screen reads (5.9–5.11): the sheet with each deal's collections and its split per salesperson,
 * «لوحة الإيرادات», the Achievements ranking and the split export. Nothing here writes a deal.
 */
@Injectable()
export class DealSheetService {
  constructor(
    private readonly repo: DealSheetRepository,
    private readonly audit: AuditService,
    private readonly vouchers: VouchersService,
    private readonly targets: TargetsService,
  ) {}

  /** The same scope as the deals list (M-02 4.1): the deals the caller, their team or everyone is on. */
  private scope(me: CurrentUser): Prisma.DealWhereInput {
    const own = ownedBy(me, "employeeId");
    return Object.keys(own).length ? { participants: { some: own } } : {};
  }

  async sheet(me: CurrentUser, f: { q?: string | undefined; statuses?: string[] | undefined } = {}): Promise<DealSheet> {
    const hidden = me.fields.hidden("deals"); // M-09: hidden fields are blanked, and not searched
    const rows = await this.repo.sheet(this.scope(me), { ...f, byLocation: !hidden.has("location") });
    const people = new Map(rows.flatMap((d) => d.participants.map((p) => [p.employeeId, p.employee] as const)));
    const scheme = (id: string) => Number(people.get(id)?.commissionPct ?? 0);
    const deals = rows.map(money);
    const t = revenueBoard(deals, scheme);
    const items = rows.map((d, i): DealSheetRow => {
      const m = deals[i]!;
      const shares = countsAsRevenue(m) ? splitDeal(m, scheme) : [];
      return {
        ...toRow({ ...d, participants: d.participants.map((p) => ({ side: p.side, approved: p.approved, employee: { id: p.employee.id, name: p.employee.name } })) }),
        source: d.source, collectedOwner: toDecimal(collectedFrom(m, "owner")), collectedClient: toDecimal(collectedFrom(m, "client")),
        collected: toDecimal(collected(m)), remaining: toDecimal(remaining(m)), firstPaidAt: d.payments[0]?.receivedAt.toISOString() ?? null,
        payments: d.payments.map((p) => ({ side: p.side === "client" ? "client" : "owner", amount: p.amount.toFixed(2), at: p.receivedAt.toISOString() })),
        shares: shares.map((s) => ({
          salesId: s.salesId, name: people.get(s.salesId)?.name ?? "", tl: people.get(s.salesId)?.teamLeader?.name ?? null, side: s.side,
          share: toDecimal(s.share), targetShare: toDecimal(countsInTarget(m) ? s.targetShare : 0), schemePercent: s.schemePercent, commission: toDecimal(s.commission),
        })),
      };
    });
    const totals = { expected: toDecimal(t.expected), collected: toDecimal(t.collected), remaining: toDecimal(t.remaining), commission: toDecimal(t.commission), deals: t.deals };
    return { items: items.map((r) => hideSheetRow(r, hidden)), totals: hideTotals(totals, hidden) };
  }

  /** 5.11 · M-02 6.1: «تفاصيل الصفقات» — every salesperson on every deal that counts, for the Excel file. */
  async split(me: CurrentUser) {
    const rows = (await this.sheet(me)).items.flatMap((d) => d.shares.map((s) => ({ d, s })));
    await this.audit.record({ module: "deals", entity: "Deal", entityId: "split-export", action: "export", userId: me.id, after: { rows: rows.length } });
    return rows;
  }

  /**
   * «تصدير الصفقات» (M-12 «أي جدول في السيستم يتصدّر Excel», demo U.exportBtn): the deals in the caller's scope as the
   * screen filters them — every deal on the board, or «شيت الـ Done Deals» (approved onwards) with its search.
   */
  async exportRows(me: CurrentUser, f: DealExportQuery) {
    const { items } = await this.sheet(me, { q: f.q, statuses: f.sheet ? ON_SHEET : undefined });
    await this.audit.record({ module: "deals", entity: "Deal", entityId: "export", action: "export", userId: me.id, after: { rows: items.length, q: f.q ?? null, sheet: !!f.sheet } });
    return items;
  }

  /** M-09: a role kept from each salesperson's share doesn't see what entered the target either. */
  async achievements(me: CurrentUser, month?: string) {
    const board = await this.targets.leaderboard(me, month);
    return me.fields.hidden("deals").has("achieved") ? { ...board, rows: board.rows.map((r) => ({ ...r, achieved: "", percent: 0 })) } : board;
  }

  async collectForm() {
    return { incomes: await this.vouchers.commissionLines() };
  }

  /**
   * M-02 «محسوم في ميتنج 4 نوفمبر»: «حصّل عمولة» on the accountant's «مهامي النهارده» and the finance dashboard
   * (demo finance.js financeInbox) — every approved deal still to collect, the oldest first.
   */
  async toCollect(me: CurrentUser): Promise<DealsToCollect> {
    const rows = await this.repo.sheet({ AND: [this.scope(me), { status: { in: ["APPROVED", "PARTIALLY_COLLECTED"] } }] });
    const items = rows.map((d) => ({ d, m: money(d) })).filter((x) => awaitsCollection(x.m)).reverse();
    const hidden = me.fields.hidden("deals");
    return { items: items.map(({ d, m }) => ({ id: d.id, code: d.code, company: d.company,
      commission: hidden.has("expected") ? "" : toDecimal(placesCommission(m)), remaining: hidden.has("remaining") ? "" : toDecimal(remaining(m)) })) };
  }
}
