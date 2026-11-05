import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CampaignInput, CampaignRow } from "@places/contracts";
import { allowedValue, costPerLead, fromDecimal, isCampaignLive, localDate, toDecimal } from "@places/domain";
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
