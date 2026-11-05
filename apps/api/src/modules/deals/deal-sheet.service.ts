import { Injectable } from "@nestjs/common";
import type { Prisma } from "@places/db";
import type { DealSheet, DealSheetRow } from "@places/contracts";
import { collected, collectedFrom, countsAsRevenue, countsInTarget, dealRowOf, remaining, revenueBoard, splitDeal, toDecimal } from "@places/domain";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { VouchersService } from "../finance/vouchers.service";
import { TargetsService } from "../kpis/targets.service";
import { type DealSheetRecord, DealSheetRepository } from "./deal-sheet.repository";
import { toRow } from "./deals.service";

const money = (d: DealSheetRecord) => dealRowOf({
  ...d, commissionOwner: d.commissionOwner.toFixed(2), commissionClient: d.commissionClient.toFixed(2), targetBase: d.targetBase?.toFixed(2) ?? null,
  payments: d.payments.map((p) => ({ ...p, amount: p.amount.toFixed(2) })),
});

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

  async sheet(me: CurrentUser): Promise<DealSheet> {
    const rows = await this.repo.sheet(this.scope(me));
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
    return { items, totals: { expected: toDecimal(t.expected), collected: toDecimal(t.collected), remaining: toDecimal(t.remaining), commission: toDecimal(t.commission), deals: t.deals } };
  }

  /** 5.11 · M-02 6.1: «تفاصيل الصفقات» — every salesperson on every deal that counts, for the Excel file. */
  async split(me: CurrentUser) {
    const rows = (await this.sheet(me)).items.flatMap((d) => d.shares.map((s) => ({ d, s })));
    await this.audit.record({ module: "deals", entity: "Deal", entityId: "split-export", action: "export", userId: me.id, after: { rows: rows.length } });
    return rows;
  }

  achievements(me: CurrentUser, month?: string) {
    return this.targets.leaderboard(me, month);
  }

  async collectForm() {
    return { incomes: await this.vouchers.commissionLines() };
  }
}
