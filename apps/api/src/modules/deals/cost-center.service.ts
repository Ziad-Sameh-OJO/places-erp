import { Injectable } from "@nestjs/common";
import type { CostCenterFilters, CostCenterView } from "@places/contracts";
import { campaignShare, directCosts, fromDecimal, placesCommission, splitDeal, toDecimal, type Piasters } from "@places/domain";
import { SettingsService } from "../settings/settings.service";
import { DealsRepository } from "./deals.repository";
import { toMoney } from "./deals.service";

const dec = (v: { toFixed(n: number): string }): Piasters => fromDecimal(v.toFixed(2));

/**
 * M-07 9.10 · «Cost Center» (Q40, the requirements' example: a deal from LinkedIn shows under LinkedIn with the
 * marketing cost it carries and its commissions): each collected deal's revenue (Places' commission, booked at the
 * first collection), its campaign's spend ÷ the campaign's Qualified leads, and its commissions (the salespeople's on
 * what was collected + operations + external, 9.6). The accounts keep the campaign as one total; nothing posts here.
 */
@Injectable()
export class CostCenterService {
  constructor(private readonly repo: DealsRepository, private readonly settings: SettingsService) {}

  async report(f: CostCenterFilters): Promise<CostCenterView> {
    const [deals, s, sales, campaigns] = await Promise.all([this.repo.costCenter(f), this.settings.all(), this.repo.salespeople(), this.repo.campaigns()]);
    const ids = [...new Set(deals.flatMap((d) => (d.lead?.campaign ? [d.lead.campaign.id] : [])))];
    const people = deals.flatMap((d) => d.participants.map((p) => p.employee.id));
    const [qualified, schemes] = await Promise.all([this.repo.qualifiedLeads(ids), this.repo.schemes([...new Set(people)])]);
    const pct = new Map(schemes.map((e) => [e.id, Number(e.commissionPct ?? 0)]));
    const rates = { opsPct: s.opsCommissionPct, externalPct: s.externalCommissionPct };
    const byChannel = new Map<string, { revenue: Piasters; marketing: Piasters }>();
    const rows = deals.map((d) => {
      const money = toMoney(d, d.payments);
      const revenue = placesCommission(money);
      const c = d.lead?.campaign;
      const marketing = c ? campaignShare(dec(c.spent), qualified.get(c.id) ?? 0) : 0;
      const direct = directCosts(revenue, rates, d.externalCommission ? dec(d.externalCommission) : null);
      const commission = splitDeal(money, (id) => pct.get(id) ?? 0).reduce((t, x) => t + x.commission, 0) + direct.ops + direct.external;
      const ch = byChannel.get(d.source) ?? { revenue: 0, marketing: 0 };
      byChannel.set(d.source, { revenue: ch.revenue + revenue, marketing: ch.marketing + marketing });
      return {
        id: d.id, code: d.code, channel: d.source, campaign: c?.name ?? null, sales: d.participants.map((p) => p.employee.name), area: d.lead?.area ?? null,
        revenue: toDecimal(revenue), marketing: toDecimal(marketing), commission: toDecimal(commission), net: toDecimal(revenue - marketing - commission),
      };
    });
    return {
      rows,
      byChannel: [...byChannel].map(([channel, v]) => ({ channel, revenue: toDecimal(v.revenue), marketing: toDecimal(v.marketing) })),
      options: { sales, campaigns },
    };
  }
}
