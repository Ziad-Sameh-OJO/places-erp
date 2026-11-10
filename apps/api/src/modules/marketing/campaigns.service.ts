import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { NOT_QUALIFIED_ROWS, type CampaignInput, type CampaignRow, type CampaignUnitOption, type DashboardQuery, type MarketingDashboard, type NotQualifiedQuery, type NotQualifiedView, type PageNameRow } from "@places/contracts";
import {
  LEAD_STAGES, allowedValue, campaignBudget, campaignDays, channelTree, countByReason, qualificationRate, costPerLead, dayStart, fromDecimal, isCampaignLive, lastSalesAct, leadsByPost, localDate, pageNameProblem, toDecimal,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryService } from "../inventory/inventory.service";
import { SettingsService } from "../settings/settings.service";
import { CAMPAIGN, CampaignsRepository } from "./campaigns.repository";

type Campaign = Prisma.CampaignGetPayload<typeof CAMPAIGN>;
const NO_CAMPAIGN = "الكامبين دي مش موجودة";
const NO_PAGE = "اسم الصفحة ده مش موجود";

/** M-04 2.1 step 1 · 3.1: the campaigns screen — add, edit, archive, with their leads, Qualified and cost. */
@Injectable()
export class CampaignsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: CampaignsRepository,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly inventory: InventoryService,
  ) {}

  /** 4.20 · the unit picker: the available units, plus the ones this campaign already targets. */
  async unitOptions(me: CurrentUser, campaignId?: string): Promise<CampaignUnitOption[]> {
    const c = campaignId ? await this.repo.find(campaignId) : null;
    return this.inventory.forCampaigns(me, c ? c.units.map((x) => x.unit.id) : []);
  }

  /**
   * The units picked must be available (or already on the campaign); the target text becomes their projects (demo
   * `targetText`), so the dashboard and old screens still read it.
   */
  private async pickUnits(me: CurrentUser, input: CampaignInput, before: Campaign | null): Promise<CampaignInput> {
    if (!input.unitIds.length) return input;
    const options = new Map((await this.inventory.forCampaigns(me, before ? before.units.map((x) => x.unit.id) : [])).map((u) => [u.id, u]));
    if (input.unitIds.some((id) => !options.has(id))) throw new BadRequestException("فيه وحدة مش متاحة في الانفنتوري");
    const unitIds = [...new Set(input.unitIds)];
    return { ...input, unitIds, target: [...new Set(unitIds.map((id) => options.get(id)!.project))].join("، ").slice(0, 200) };
  }

  async list(me: CurrentUser, now = new Date()): Promise<CampaignRow[]> {
    const rows = await this.repo.list();
    const counts = await this.repo.counts(rows.map((c) => c.id));
    const today = localDate(now), hidden = me.fields.hidden("marketing");
    return rows.map((c) => hideFields(toRow(c, counts.get(c.id) ?? { leads: 0, qualified: 0 }, today), hidden));
  }

  /**
   * M-04 3.2 · 6.1: channel → campaign → post, leads and Qualified with the rate, for a period of Cairo days and an
   * optional channel / campaign. Every arrival counts, the duplicates too (Q22), so the numbers match the leads' arrivals.
   */
  async dashboard(me: CurrentUser, q: DashboardQuery): Promise<MarketingDashboard> {
    const hidden = me.fields.hidden("marketing"), h = (k: string) => hidden.has(k);
    const rows = await this.repo.arrivals(arrivalsIn(q));
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
      spent: h("spent") ? "" : toDecimal(spent), costPerQualified: perQualified === null || h("costPerQualified") ? null : toDecimal(perQualified), campaignCount: covered.length,
      channels: tree.map((c) => ({
        channel: c.channel, leads: c.leads, qualified: c.qualified, rate: c.rate, noCampaign: c.noCampaign,
        campaigns: c.campaigns.map((x) => {
          const info = camps.get(x.campaignId);
          const cost = info ? costPerLead(fromDecimal(money(info.spent)), x.leads) : null;
          return {
            id: x.campaignId, name: info?.name ?? "—", target: h("target") ? null : info?.target ?? null, leads: x.leads, qualified: x.qualified, rate: x.rate,
            costPerLead: cost === null || h("costPerLead") ? null : toDecimal(cost),
          };
        }),
      })),
      posts: leadsByPost(arrivals),
    };
  }

  /**
   * 4.18 · «الليدز اللي ماكانتش Qualified» (demo marketing.js `notQualified`), with the dashboard's filter: how many per
   * reason (the lead's stage = what the salesperson did), and the latest ones with the salesperson's last comment and who
   * wrote it. Marketing sees the comment and the stage, never the client's mobile.
   */
  async notQualified(q: NotQualifiedQuery): Promise<NotQualifiedView> {
    const where = arrivalsIn(q);
    const [total, leads] = await Promise.all([this.repo.leadsIn(where), this.repo.notQualified(where)]);
    const all = leads.map((l) => ({ ...l, reason: STAGE_LABEL.get(l.stage) ?? l.stage }));
    const list = all.filter((l) => !q.reason || l.reason === q.reason);
    const acts = await this.repo.peopleActs(list.map((l) => l.id));
    const byLead = new Map<string, typeof acts>();
    for (const a of acts) byLead.set(a.leadId, [...(byLead.get(a.leadId) ?? []), a]);
    const last = new Map(list.map((l) => [l.id, lastSalesAct(byLead.get(l.id) ?? [])]));
    const when = (l: (typeof list)[number]) => (last.get(l.id)?.at ?? l.arrivedAt).getTime();
    const shown = list.sort((a, b) => when(b) - when(a)).slice(0, NOT_QUALIFIED_ROWS);
    const names = await this.repo.names([...new Set(shown.map((l) => last.get(l.id)?.byUserId).filter((x): x is string => !!x))]);
    return {
      total, notQualified: all.length, byReason: countByReason(all.map((l) => l.reason)), matching: list.length,
      rows: shown.map((l) => {
        const c = last.get(l.id);
        return {
          id: l.id, code: l.code, name: l.name, channel: l.channel, campaign: l.campaign?.name ?? null, reason: l.reason,
          comment: c ? { text: c.text, by: names.get(c.byUserId!) ?? "", at: c.at.toISOString() } : null,
        };
      }),
    };
  }

  /** «channel الكامبين» comes from the «الـ Channels» list (M-13), the active ones. */
  async channels(): Promise<string[]> {
    return (await this.settings.all()).channels.filter((c) => c.active).map((c) => c.value);
  }

  async create(me: CurrentUser, input: CampaignInput): Promise<{ id: string }> {
    await this.checkChannel(input.channel, null);
    await this.checkPage(input.page, null);
    input = await this.pickUnits(me, keepFixed(input, null, me.fields.fixed("marketing")), null);
    const data = toData(input);
    return this.db.$transaction(async (tx) => {
      const c = await this.repo.create(tx, data);
      await this.repo.setUnits(tx, c.id, input.unitIds);
      await this.audit.record({ module: "marketing", entity: "Campaign", entityId: c.id, action: "create", userId: me.id, after: { ...input } }, tx);
      return { id: c.id };
    });
  }

  /** The whole form is sent back; the budget and the cost are money, so every change is audited with its old value. */
  async update(me: CurrentUser, id: string, input: CampaignInput): Promise<{ id: string }> {
    const before = await this.repo.find(id);
    if (!before) throw new NotFoundException(NO_CAMPAIGN);
    await this.checkChannel(input.channel, before.channel);
    await this.checkPage(input.page, before.page);
    input = await this.pickUnits(me, keepFixed(input, before, me.fields.fixed("marketing")), before);
    await this.db.$transaction(async (tx) => {
      await this.repo.update(tx, id, toData(input));
      await this.repo.setUnits(tx, id, input.unitIds);
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

  /** «Page name» comes from «أسماء الصفحات»; a campaign keeps a name removed from the list since. */
  private async checkPage(page: string | undefined, before: string | null) {
    if (!page || page === before) return;
    if (!(await this.repo.pages()).some((p) => p.name === page)) throw new BadRequestException("اختار الـ Page name من القايمة");
  }

  // ───────── 4.19 · «أسماء الصفحات» ─────────

  pages(): Promise<PageNameRow[]> {
    return this.repo.pages();
  }

  async addPage(me: CurrentUser, name: string): Promise<PageNameRow> {
    this.checkName(await this.repo.pages(), name, null);
    return this.db.$transaction(async (tx) => {
      const p = await this.repo.addPage(tx, name);
      await this.audit.record({ module: "marketing", entity: "CampaignPage", entityId: p.id, action: "create", userId: me.id, after: { name, summary: `اسم صفحة جديد: ${name}` } }, tx);
      return { id: p.id, name: p.name, campaigns: 0 };
    });
  }

  /** A rename applies to the campaigns on it (demo «تغيير اسم بيتطبّق على الكامبينز اللي عليه»). */
  async renamePage(me: CurrentUser, id: string, name: string): Promise<void> {
    const p = await this.repo.page(id);
    if (!p) throw new NotFoundException(NO_PAGE);
    if (p.name === name) return;
    this.checkName(await this.repo.pages(), name, p.name);
    await this.db.$transaction(async (tx) => {
      const moved = await this.repo.renamePage(tx, id, p.name, name);
      await this.audit.record({ module: "marketing", entity: "CampaignPage", entityId: id, action: "update", userId: me.id,
        before: { name: p.name }, after: { name, campaigns: moved, summary: `اسم صفحة: ${p.name} ← ${name}` } }, tx);
    });
  }

  /** Off the list; the campaigns on it keep the name (demo «الكامبينز اللي عليه هتفضل باسمها»). */
  async removePage(me: CurrentUser, id: string): Promise<void> {
    const p = await this.repo.page(id);
    if (!p) throw new NotFoundException(NO_PAGE);
    await this.db.$transaction(async (tx) => {
      await this.repo.removePage(tx, id);
      await this.audit.record({ module: "marketing", entity: "CampaignPage", entityId: id, action: "delete", userId: me.id, before: { name: p.name }, after: { summary: `اتشال اسم صفحة: ${p.name}` } }, tx);
    });
  }

  private checkName(list: PageNameRow[], name: string, current: string | null) {
    const problem = pageNameProblem(list.map((p) => p.name), name, current);
    if (problem) throw new BadRequestException(problem);
  }

  private async checkChannel(channel: string, before: string | null) {
    const list = (await this.settings.all()).channels;
    if (!allowedValue(list, channel, before)) throw new BadRequestException("اختار الـ Channel من القايمة");
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);
/** sales.LeadStage (FOLLOW_UP_TO_VISIT) → its name (Follow up to Visit). */
const STAGE_LABEL = new Map<string, string>(LEAD_STAGES.map((s) => [s.toUpperCase().replace(/ /g, "_"), s]));
/** The dashboard's filter as arrivals: a period of Cairo days (the «to» day whole), a channel, a campaign. */
function arrivalsIn(q: DashboardQuery): Prisma.LeadArrivalWhereInput {
  const at = { ...(q.from ? { gte: dayStart(q.from) } : {}), ...(q.to ? { lt: dayStart(nextDay(q.to)) } : {}) };
  return { ...(q.channel ? { channel: q.channel } : {}), ...(q.campaignId ? { campaignId: q.campaignId } : {}), ...(q.from || q.to ? { at } : {}) };
}
/** The calendar day after «YYYY-MM-DD» (a «to» filter includes its whole day). */
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const money = (d: Prisma.Decimal) => d.toFixed(2);

function toData(c: CampaignInput) {
  return {
    name: c.name, channel: c.channel, startsOn: new Date(`${c.startsOn}T00:00:00Z`), endsOn: c.endsOn ? new Date(`${c.endsOn}T00:00:00Z`) : null,
    budget: c.budget, dailyBudget: c.dailyBudget ?? null, spent: c.spent, target: c.target ?? null, page: c.page ?? null, adUrl: c.adUrl ?? null, note: c.note ?? null,
  };
}

/** The audit's «before»: days and money as on the wire. */
const plain = (c: Campaign) => ({
  name: c.name, channel: c.channel, startsOn: day(c.startsOn), endsOn: c.endsOn ? day(c.endsOn) : null, budget: money(c.budget),
  dailyBudget: c.dailyBudget ? money(c.dailyBudget) : null, spent: money(c.spent), target: c.target, page: c.page, adUrl: c.adUrl, note: c.note,
  units: c.units.map((x) => x.unit),
});

function toRow(c: Campaign, n: { leads: number; qualified: number }, today: string): CampaignRow {
  const cost = costPerLead(fromDecimal(money(c.spent)), n.leads);
  const p = plain(c), period = { startsOn: p.startsOn, endsOn: p.endsOn };
  const budget = campaignBudget({ ...period, dailyBudget: p.dailyBudget === null ? null : fromDecimal(p.dailyBudget), budget: fromDecimal(p.budget) }, today);
  return {
    ...p, id: c.id, budget: toDecimal(budget), days: campaignDays(period, today), live: isCampaignLive(period, today),
    leads: n.leads, qualified: n.qualified, costPerLead: cost === null ? null : toDecimal(cost),
  };
}

/**
 * M-09 field permissions: a hidden field's value never leaves the API (blank, its kind kept); the screens leave its
 * column and input out (they read the same rules).
 */
function hideFields(r: CampaignRow, hidden: ReadonlySet<string>): CampaignRow {
  if (!hidden.size) return r;
  const h = (k: string) => hidden.has(k);
  return {
    ...r, budget: h("budget") ? "" : r.budget, dailyBudget: h("budget") ? null : r.dailyBudget, spent: h("spent") ? "" : r.spent, costPerLead: h("costPerLead") ? null : r.costPerLead,
    target: h("target") ? null : r.target, units: h("target") ? [] : r.units, adUrl: h("adUrl") ? null : r.adUrl, note: h("note") ? null : r.note,
  };
}

/** A field the person may not set: its value as stored (an edit), or empty (a new campaign). */
function keepFixed(input: CampaignInput, before: Campaign | null, fixed: ReadonlySet<string>): CampaignInput {
  if (!fixed.size) return input;
  const f = (k: string) => fixed.has(k);
  return {
    ...input,
    budget: f("budget") ? (before ? money(before.budget) : "0") : input.budget,
    dailyBudget: f("budget") ? (before?.dailyBudget ? money(before.dailyBudget) : undefined) : input.dailyBudget,
    unitIds: f("target") ? before?.units.map((x) => x.unit.id) ?? [] : input.unitIds, spent: f("spent") ? (before ? money(before.spent) : "0") : input.spent,
    target: f("target") ? before?.target ?? undefined : input.target, adUrl: f("adUrl") ? before?.adUrl ?? undefined : input.adUrl,
    note: f("note") ? before?.note ?? undefined : input.note,
  };
}
