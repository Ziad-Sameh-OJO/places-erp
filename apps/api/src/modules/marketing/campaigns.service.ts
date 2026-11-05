import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CampaignInput, CampaignRow, DashboardQuery, MarketingDashboard } from "@places/contracts";
import { allowedValue, channelTree, qualificationRate, costPerLead, dayStart, fromDecimal, isCampaignLive, leadsByPost, localDate, toDecimal } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";
import { CampaignsRepository } from "./campaigns.repository";

type Campaign = Prisma.CampaignGetPayload<object>;
const NO_CAMPAIGN = "الكامبين دي مش موجودة";

/** M-04 2.1 step 1 · 3.1: the campaigns screen — add, edit, archive, with their leads, Qualified and cost. */
@Injectable()
export class CampaignsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: CampaignsRepository,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async list(now = new Date()): Promise<CampaignRow[]> {
    const rows = await this.repo.list();
    const counts = await this.repo.counts(rows.map((c) => c.id));
    const today = localDate(now);
    return rows.map((c) => toRow(c, counts.get(c.id) ?? { leads: 0, qualified: 0 }, today));
  }

  /**
   * M-04 3.2 · 6.1: channel → campaign → post, leads and Qualified with the rate, for a period of Cairo days and an
   * optional channel / campaign. Every arrival counts, the duplicates too (Q22), so the numbers match the leads' arrivals.
   */
  async dashboard(q: DashboardQuery): Promise<MarketingDashboard> {
    const at = { ...(q.from ? { gte: dayStart(q.from) } : {}), ...(q.to ? { lt: dayStart(nextDay(q.to)) } : {}) };
    const pick = { ...(q.channel ? { channel: q.channel } : {}), ...(q.campaignId ? { campaignId: q.campaignId } : {}) };
    const rows = await this.repo.arrivals({ ...pick, ...(q.from || q.to ? { at } : {}) });
    const arrivals = rows.map((r) => ({ channel: r.channel, campaignId: r.campaignId, qualified: r.lead.qualified, post: r.lead.post }));
    const tree = channelTree(arrivals);
    const camps = new Map((await this.repo.byIds(tree.flatMap((c) => c.campaigns.map((x) => x.campaignId)))).map((c) => [c.id, c]));
    const covered = await this.repo.covered(q.campaignId ? { id: q.campaignId } : q.channel ? { channel: q.channel } : {});
    const spent = covered.reduce((s, c) => s + fromDecimal(money(c.spent)), 0);
    const qualified = arrivals.filter((a) => a.qualified).length;
    const total = { leads: arrivals.length, qualified, rate: qualificationRate(qualified, arrivals.length) };
    const perQualified = costPerLead(spent, total.qualified);
    return {
      total: { leads: total.leads, qualified: total.qualified, rate: total.rate },
      spent: toDecimal(spent), costPerQualified: perQualified === null ? null : toDecimal(perQualified), campaignCount: covered.length,
      channels: tree.map((c) => ({
        channel: c.channel, leads: c.leads, qualified: c.qualified, rate: c.rate, noCampaign: c.noCampaign,
        campaigns: c.campaigns.map((x) => {
          const info = camps.get(x.campaignId);
          const cost = info ? costPerLead(fromDecimal(money(info.spent)), x.leads) : null;
          return { id: x.campaignId, name: info?.name ?? "—", target: info?.target ?? null, leads: x.leads, qualified: x.qualified, rate: x.rate, costPerLead: cost === null ? null : toDecimal(cost) };
        }),
      })),
      posts: leadsByPost(arrivals),
    };
  }

  /** «channel الكامبين» comes from the «الـ Channels» list (M-13), the active ones. */
  async channels(): Promise<string[]> {
    return (await this.settings.all()).channels.filter((c) => c.active).map((c) => c.value);
  }

  async create(me: CurrentUser, input: CampaignInput): Promise<{ id: string }> {
    await this.checkChannel(input.channel, null);
    const data = toData(input);
    return this.db.$transaction(async (tx) => {
      const c = await this.repo.create(tx, data);
      await this.audit.record({ module: "marketing", entity: "Campaign", entityId: c.id, action: "create", userId: me.id, after: { ...input } }, tx);
      return { id: c.id };
    });
  }

  /** The whole form is sent back; the budget and the cost are money, so every change is audited with its old value. */
  async update(me: CurrentUser, id: string, input: CampaignInput): Promise<{ id: string }> {
    const before = await this.repo.find(id);
    if (!before) throw new NotFoundException(NO_CAMPAIGN);
    await this.checkChannel(input.channel, before.channel);
    await this.db.$transaction(async (tx) => {
      await this.repo.update(tx, id, toData(input));
      await this.audit.record({ module: "marketing", entity: "Campaign", entityId: id, action: "update", userId: me.id, before: plain(before), after: { ...input } }, tx);
    });
    return { id };
  }

  /** Archived, never deleted: its leads and their arrivals still point at it. */
  async archive(me: CurrentUser, id: string) {
    const before = await this.repo.find(id);
    if (!before) throw new NotFoundException(NO_CAMPAIGN);
    await this.db.$transaction(async (tx) => {
      await this.repo.update(tx, id, { archivedAt: new Date() });
      await this.audit.record({ module: "marketing", entity: "Campaign", entityId: id, action: "archive", userId: me.id, before: plain(before) }, tx);
    });
  }

  private async checkChannel(channel: string, before: string | null) {
    const list = (await this.settings.all()).channels;
    if (!allowedValue(list, channel, before)) throw new BadRequestException("اختار الـ Channel من القايمة");
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);
/** The calendar day after «YYYY-MM-DD» (a «to» filter includes its whole day). */
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const money = (d: Prisma.Decimal) => d.toFixed(2);

function toData(c: CampaignInput) {
  return {
    name: c.name, channel: c.channel, startsOn: new Date(`${c.startsOn}T00:00:00Z`), endsOn: new Date(`${c.endsOn}T00:00:00Z`),
    budget: c.budget, spent: c.spent, target: c.target ?? null, adUrl: c.adUrl ?? null, note: c.note ?? null,
  };
}

/** The audit's «before»: days and money as on the wire. */
const plain = (c: Campaign) => ({
  name: c.name, channel: c.channel, startsOn: day(c.startsOn), endsOn: day(c.endsOn), budget: money(c.budget), spent: money(c.spent),
  target: c.target, adUrl: c.adUrl, note: c.note,
});

function toRow(c: Campaign, n: { leads: number; qualified: number }, today: string): CampaignRow {
  const cost = costPerLead(fromDecimal(money(c.spent)), n.leads);
  return {
    ...plain(c), id: c.id, live: isCampaignLive({ startsOn: day(c.startsOn), endsOn: day(c.endsOn) }, today),
    leads: n.leads, qualified: n.qualified, costPerLead: cost === null ? null : toDecimal(cost),
  };
}
