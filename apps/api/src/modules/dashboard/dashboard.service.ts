import { Injectable, NotFoundException } from "@nestjs/common";
import {
  UnitFilters, type AhmedDashboard, type AhmedPerson, type AhmedQuery, type AttentionLine, type CompanyDashboard, type DashPerson, type DashboardLayoutView,
  type MyDashboard, type PacedBar, type PersonPerformance, type StageCount, type TargetBar,
} from "@places/contracts";
import {
  CLIENTS_PARENT, DASHBOARD_STAGES, FUNNEL_STAGES, budgetBroken, comparisonWindows, conversionRate, dashboardLayout, dashboardPeriods, dayStart, fromDecimal,
  isCampaignLive, lateWithoutExcuse, localDate, moneyBuckets, monthBounds, opensOnDashboard, periodId, quarterBounds, quarterMonths, quarterOfDay, sumIn,
  targetPace, targetProgress, teamProgress, toDecimal, topAchiever, topSales, trendBuckets, type Piasters, type WorkCalendar,
} from "@places/domain";
import { LeadsService } from "../leads/leads.service";
import { CampaignsService } from "../marketing/campaigns.service";
import { ContractsService } from "../contracts/contracts.service";
import { SettingsService } from "../settings/settings.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { leadScope } from "../leads/lead-scope";
import { TargetsService } from "../kpis/targets.service";
import { InventoryService } from "../inventory/inventory.service";
import { LedgerService } from "../finance/ledger.service";
import { VouchersService } from "../finance/vouchers.service";
import { AttendanceService } from "../hr/attendance.service";
import { DashboardRepository } from "./dashboard.repository";

type Figure = Awaited<ReturnType<TargetsService["rangeFigures"]>>[number];
const DAY = 86_400_000;
const SALE_TYPES = ["Resale", "Income", "Primary"] as const; // «For Sale»: every type that is sold (unit-pdf's headline)
const toDb = (stage: string) => stage.toUpperCase().replace(/ /g, "_");
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 14.1–14.3 · the dashboards: read only, each number from the module that owns it and in the caller's scope. A section
 * needing a module the person may not see comes back null (the endpoint's own grant doesn't open the others).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly repo: DashboardRepository,
    private readonly time: BusinessTimeService,
    private readonly targets: TargetsService,
    private readonly inventory: InventoryService,
    private readonly ledger: LedgerService,
    private readonly vouchers: VouchersService,
    private readonly attendance: AttendanceService,
    private readonly leads: LeadsService,
    private readonly campaigns: CampaignsService,
    private readonly contracts: ContractsService,
    private readonly settings: SettingsService,
  ) {}

  async layout(me: CurrentUser): Promise<DashboardLayoutView> {
    const layout = dashboardLayout(await this.repo.layoutOf(me.id), { reportsView: me.grants.can("reports", "view"), scope: me.grants.scope });
    return { layout, landing: opensOnDashboard(layout) ? "/dashboard" : "/" };
  }

  /** 14.2 · 14.3: the company today, by stage, its inventory, targets, teams, finance, sales and marketing. */
  async company(me: CurrentUser, now = new Date()): Promise<CompanyDashboard> {
    const cal = await this.time.calendar(), r = ranges(now, cal), leads = leadScope(me) as never, can = (m: Parameters<typeof me.grants.can>[0]) => me.grants.can(m, "view");
    const [[newLeads, interested], stages, vToday, vQuarter, vYear, doneDeals, units, pulled, quarter, year] = await Promise.all([
      this.repo.leadsSince(leads, r.today.from), this.stages(leads), this.repo.visits({ leads }, r.today.from, now), this.repo.visits({ leads }, r.quarter.from, now),
      this.repo.visits({ leads }, r.year.from, now), this.repo.dealsClosed(r.today.from, r.today.to), this.repo.unitsAdded(r.today.from), this.repo.pulledFrom(r.today.from),
      this.targets.rangeFigures(me, r.quarter.from, r.quarter.to, r.p.quarterMonths), this.targets.rangeFigures(me, r.year.from, r.year.to, r.p.yearMonths),
    ]);
    const [late, money, inventory, campaigns, ideal] = await Promise.all([
      can("hr") ? this.repo.lateOn(r.p.today).then((rows) => rows.filter(lateWithoutExcuse).map((x) => x.employee.name)) : null,
      can("finance") && !me.fields.hidden("finance").has("amount") ? this.finance() : null,
      can("inventory") ? this.inventory.tabs(me, UnitFilters.parse({})) : null,
      can("marketing") ? this.repo.campaigns() : null,
      can("hr") ? this.attendance.idealKpi(me) : null,
    ]);
    const hide = me.fields.hidden("reports"), person = (f: Figure): DashPerson => ({
      employeeId: f.employeeId, userId: f.userId, name: f.name, percent: hide.has("percent") ? null : targetProgress(f.achieved, f.goal), achieved: hide.has("achieved") ? "" : toDecimal(f.achieved),
    });
    const bar = (rows: Figure[]) => barOf(teamProgress(rows), hide);
    const teams = [...new Set(quarter.flatMap((f) => (f.tlId ? [f.tlId] : [])))].map((tlId) => {
      const members = quarter.filter((f) => f.tlId === tlId);
      return { tlId, tl: members[0]!.tl ?? "", team: members[0]!.team, percent: hide.has("percent") ? null : teamProgress(members).percent, members: members.map(person).sort(byPercent) };
    }).sort(byPercent);
    const best = ideal?.sales.find((x) => x.ideal) ?? null;
    const top = topSales(quarter.map((f) => ({ f, achieved: f.achieved, percent: targetProgress(f.achieved, f.goal) })), 3);
    const achiever = topAchiever(year);
    const live = campaigns?.filter((c) => isCampaignLive({ startsOn: isoDay(c.startsOn), endsOn: c.endsOn ? isoDay(c.endsOn) : null }, r.p.today));
    const card = (c: { id: string; name: string; channel: string }) => ({ id: c.id, name: c.name, channel: c.channel });
    return {
      day: r.p.today, quarter: r.p.quarter, year: r.p.year,
      today: {
        leads: newLeads, interested, visits: count(vToday, "visit"), meetings: count(vToday, "meeting"), doneDeals, units, pulled, late,
        paid: money?.today.paid ?? null, received: money?.today.received ?? null,
      },
      stages,
      inventory: inventory && { rent: inventory.Rent, sale: SALE_TYPES.reduce((s, t) => s + inventory[t], 0), types: (["Rent", ...SALE_TYPES] as const).map((type) => ({ type, count: inventory[type] })) },
      targets: { quarter: bar(quarter), year: bar(year) },
      activity: { quarter: { visits: count(vQuarter, "visit"), meetings: count(vQuarter, "meeting") }, year: { visits: count(vYear, "visit"), meetings: count(vYear, "meeting") } },
      teams,
      sales: { top: top.map((x) => person(x.f)), topAchiever: achiever && person(achiever), ideal: best && { employeeId: best.employeeId, name: best.name } },
      finance: money && { ...money.figures },
      marketing: campaigns && live ? { live: live.map(card), off: campaigns.filter((c) => !live.includes(c)).slice(0, 8).map(card) } : null,
    };
  }

  /**
   * Ahmed Islam's one page: the period against the previous one up to the same point, the funnel, the charts (leads trend, channels, collections), the target line, the
   * teams, «محتاج انتباهك», and the money / inventory / marketing cards. A card the person may not see comes back null,
   * an attention line he may not see is left out.
   */
  async ahmed(me: CurrentUser, q: AhmedQuery, now = new Date()): Promise<AhmedDashboard> {
    const cal = await this.time.calendar(), today = localDate(now, cal), picked = q.year && q.quarter ? periodId(q.year, q.quarter) : undefined;
    const { current: cur, previous: prev } = comparisonWindows(q.period, now, cal, picked);
    const quarter = (q.period === "quarter" && picked) || quarterOfDay(today), qb = quarterBounds(quarter, cal);
    // the target card: the year to make and one month of it (management, 22 Nov); a past quarter shows its last month
    const tm = q.month ?? (quarterOfDay(today) === quarter ? today.slice(0, 7) : quarterMonths(quarter)[2]), tmb = monthBounds(tm, cal), year = tm.slice(0, 4);
    const yearMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    const yb = { from: monthBounds(yearMonths[0]!, cal).from, to: monthBounds(yearMonths[11]!, cal).to };
    const leads = leadScope(me) as never, can = (m: Parameters<typeof me.grants.can>[0]) => me.grants.can(m, "view");
    const pair = async <T>(f: (w: { from: Date; to: Date }) => Promise<T>) => { const [a, b] = await Promise.all([f(cur), f(prev)]); return { now: a, before: b }; };
    const week = comparisonWindows("week", now, cal).current.from, month = today.slice(0, 7);
    const seesMoney = can("finance") && !me.fields.hidden("finance").has("amount");
    const tb = trendBuckets(q.period, now, cal, picked), mb = moneyBuckets(q.period, now, cal, picked);
    const charts = Promise.all([
      this.repo.leadTimes(leads, tb.current[0]!.from, tb.current.at(-1)!.to), this.repo.leadTimes(leads, tb.previous[0]!.from, tb.previous.at(-1)!.to),
      this.repo.leadsByChannel(leads, cur.from, cur.to), seesMoney ? this.repo.moneyRows(mb.buckets[0]!.from, mb.buckets.at(-1)!.to) : null,
    ]);
    const [visits, doneDeals, newLeads, units, collected, stages, quarterFig, yearFig, monthFig, byPerson, dealsBy, settings] = await Promise.all([
      pair((w) => this.repo.visits({ leads }, w.from, w.to)), pair((w) => this.repo.dealsClosed(w.from, w.to)),
      pair((w) => this.repo.leadsSince(leads, w.from, w.to).then(([n]) => n)), pair((w) => this.repo.unitsAdded(w.from, w.to)),
      seesMoney ? pair((w) => this.repo.collected(w.from, w.to)) : null,
      this.repo.stageCounts(leads, FUNNEL_STAGES.map(toDb)),
      this.targets.rangeFigures(me, qb.from, qb.to, quarterMonths(quarter)), this.targets.rangeFigures(me, yb.from, yb.to, yearMonths),
      this.targets.rangeFigures(me, tmb.from, tmb.to, [tm]), this.repo.visitsByPerson(cur.from, cur.to), this.repo.dealsByPerson(cur.from, cur.to), this.settings.all(),
    ]);
    const [money, finance, inventory, marketing, attention] = await Promise.all([
      can("contracts") ? this.installments(me, today, month, now) : null,
      can("finance") && !me.fields.hidden("finance").has("amount") ? this.finance() : null,
      can("inventory") ? Promise.all([this.inventory.tabs(me, UnitFilters.parse({ closedFrom: `${month}-01`, closedTo: today })), this.repo.unitsAdded(week)]) : null,
      can("marketing") ? this.marketing(me, today, localDate(cur.from, cal), lastDay(cur, cal)) : null,
      this.attention(me, leads, settings.dashboardStaleNearClose, now),
    ]);

    const hide = me.fields.hidden("reports");
    const counts = FUNNEL_STAGES.map((stage) => stages.find((x) => x.stage === toDb(stage))?._count._all ?? 0);
    const paced = (rows: Figure[], from: string, to: string): PacedBar => {
      const t = teamProgress(rows), pace = targetPace({ goal: t.goal, achieved: t.achieved, from, to, today }, cal), off = hide.has("value") || t.goal <= 0;
      return { ...barOf(t, hide), expected: off ? "" : toDecimal(pace.expected), perDay: off || hide.has("achieved") || pace.perDay == null ? null : toDecimal(pace.perDay) };
    };
    const seen = (userId: string, kind: string) => byPerson.filter((x) => x.byUserId === userId && x.kind === kind).reduce((n, x) => n + x._count._all, 0);
    const member = (f: Figure): AhmedPerson => ({
      employeeId: f.employeeId, userId: f.userId, name: f.name, achieved: hide.has("achieved") ? "" : toDecimal(f.achieved),
      percent: hide.has("percent") ? null : targetProgress(f.achieved, f.goal) ?? 0, // no target = 0% on this table, not «—»
      visits: seen(f.userId, "visit"), meetings: seen(f.userId, "meeting"), deals: dealsBy.find((x) => x.employeeId === f.employeeId)?._count._all ?? 0,
    });
    const sum = (xs: AhmedPerson[], k: "visits" | "meetings" | "deals") => xs.reduce((n, x) => n + x[k], 0);
    const teams = [...new Set(quarterFig.flatMap((f) => (f.tlId ? [f.tlId] : [])))].map((tlId) => {
      const rows = quarterFig.filter((f) => f.tlId === tlId), members = rows.map(member).sort(byPercent);
      return {
        tlId, tl: rows[0]!.tl ?? "", team: rows[0]!.team, percent: hide.has("percent") ? null : teamProgress(rows).percent ?? 0,
        visits: sum(members, "visits"), meetings: sum(members, "meetings"), deals: sum(members, "deals"), members,
      };
    }).sort(byPercent);
    const inv = inventory?.[0];
    const [leadsNow, leadsBefore, byChannel, moneyRows] = await charts;
    const ones = (times: Date[]) => times.map((at) => ({ at, value: 1 })), days = (w: { from: Date; to: Date }) => ({ from: localDate(w.from, cal), to: lastDay(w, cal) });
    const n = sumIn(ones(leadsNow), tb.current), b = sumIn(ones(leadsBefore), tb.previous);
    const collections = moneyRows && (() => {
      const piasters = (x: { toFixed(n: number): string }) => fromDecimal(x.toFixed(2));
      const got = sumIn(moneyRows[0].map((p) => ({ at: p.receivedAt, value: piasters(p.amount) })), mb.buckets);
      const due = sumIn(moneyRows[1].map((d) => ({ at: d.closedAt, value: piasters(d.commissionOwner) + piasters(d.commissionClient) })), mb.buckets);
      return { unit: mb.unit, points: mb.buckets.map((w, i) => ({ ...days(w), collected: toDecimal(got[i]!), expected: toDecimal(due[i]!) })) };
    })();
    return {
      period: q.period, from: localDate(cur.from, cal), to: lastDay(cur, cal), quarter, month: tm, year,
      strip: {
        visits: { now: count(visits.now, "visit"), before: count(visits.before, "visit") }, meetings: { now: count(visits.now, "meeting"), before: count(visits.before, "meeting") },
        doneDeals, leads: newLeads, units, collected,
      },
      funnel: FUNNEL_STAGES.map((stage, i) => ({ stage, count: counts[i]!, next: i < counts.length - 1 ? conversionRate(counts[i]!, counts[i + 1]!) : null })),
      trend: { unit: tb.unit, points: tb.current.map((w, i) => ({ at: w.from.toISOString(), ...days(w), now: w.from > now ? null : n[i]!, before: i < b.length ? b[i]! : null })) },
      channels: byChannel.map((c) => ({ channel: c.channel, leads: c._count._all })).sort((x, y) => y.leads - x.leads),
      collections,
      targets: { year: paced(yearFig, `${year}-01-01`, `${year}-12-31`), month: paced(monthFig, `${tm}-01`, lastDay(tmb, cal)) },
      teams, attention: [...attention, ...(finance ? [{ key: "budget" as const, count: finance.figures.broken.length, href: "/finance?tab=budget" }] : [])],
      staleDays: settings.dashboardStaleNearClose,
      money: money && { ...money, receivables: finance?.figures.receivables ?? null },
      inventory: inv ? {
        rent: inv.Rent, sale: SALE_TYPES.reduce((s, t) => s + inv[t], 0), types: SALE_TYPES.map((type) => ({ type, count: inv[type] })),
        newThisWeek: inventory[1], closedThisMonth: inv.closed,
      } : null,
      marketing,
    };
  }

  /** «Money»: this month's installments collected vs due, and those due in the next 7 days (not paid yet). */
  private async installments(me: CurrentUser, today: string, month: string, now: Date) {
    const end = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * DAY).toISOString().slice(0, 10);
    const months = [...new Set([month, end.slice(0, 7)])];
    const [report, ...cals] = await Promise.all([this.contracts.collections(me, month, now), ...months.map((m) => this.contracts.calendar(me, m, now))]);
    const due = cals.flatMap((c) => Object.entries(c.byDay)).filter(([d]) => d >= today && d <= end)
      .flatMap(([, items]) => items.filter((i) => i.kind === "installment" && i.state !== "paid"));
    return { collected: report.collected, due: report.due, nextWeek: { count: due.length, amount: toDecimal(due.reduce((s, i) => s + fromDecimal(i.amount ?? "0"), 0)) } };
  }

  /** «Marketing»: today's leads by channel, the period's cost per Qualified (14.13's rule), the campaigns running or not. */
  private async marketing(me: CurrentUser, today: string, from: string, to: string): Promise<AhmedDashboard["marketing"]> {
    const [day, period, campaigns] = await Promise.all([this.campaigns.dashboard(me, { from: today, to: today }), this.campaigns.dashboard(me, { from, to }), this.repo.campaigns()]);
    const live = campaigns.filter((c) => isCampaignLive({ startsOn: isoDay(c.startsOn), endsOn: c.endsOn ? isoDay(c.endsOn) : null }, today));
    const card = (c: { id: string; name: string }) => ({ id: c.id, name: c.name });
    return {
      today: day.channels.map((c) => ({ channel: c.channel, leads: c.leads })).sort((a, b) => b.leads - a.leads), costPerQualified: period.costPerQualified,
      live: live.map(card), off: campaigns.filter((c) => !live.includes(c)).slice(0, 6).map(card),
    };
  }

  /** «محتاج انتباهك» except the budget line (it comes with the finance figures): each with the list it opens. */
  private async attention(me: CurrentUser, leads: never, staleDays: number, now: Date): Promise<AttentionLine[]> {
    const can = (m: Parameters<typeof me.grants.can>[0]) => me.grants.can(m, "view");
    const [sla, stale, approval, contracts, units] = await Promise.all([
      can("leads") ? Promise.all([this.repo.slaRunning(leads), this.leads.slaClock(now)]).then(([rows, clock]) => rows.filter((x) => clock(x as never)?.level === "pull").length) : null,
      can("leads") ? this.repo.staleNearClose(leads, new Date(now.getTime() - staleDays * DAY)) : null,
      can("deals") ? this.repo.pendingDeals() : null,
      can("contracts") && !me.fields.hidden("contracts").has("late") ? this.contracts.summary(me, now) : null,
      can("inventory") ? this.inventory.summary(me) : null,
    ]);
    const lines: (AttentionLine | null)[] = [
      sla == null ? null : { key: "sla", count: sla, href: "/leads?stage=Fresh" },
      approval == null ? null : { key: "approval", count: approval, href: "/deals" },
      stale == null ? null : { key: "nearClose", count: stale, href: `/leads?stage=${encodeURIComponent("Near to Close")}` },
      contracts ? { key: "installments", count: contracts.late.count, href: "/contracts" } : null,
      units ? { key: "units", count: units.missing, href: "/inventory?missing=1" } : null,
    ];
    return lines.filter((x): x is AttentionLine => !!x);
  }

  /** The smaller dashboard of a role (14.1): my leads today and by stage, my Visits and Meetings, my month and quarter. */
  async mine(me: CurrentUser, now = new Date()): Promise<MyDashboard> {
    const cal = await this.time.calendar(), r = ranges(now, cal), leads = leadScope(me) as never;
    const [[newLeads], stages, visits, month, quarter] = await Promise.all([
      this.repo.leadsSince(leads, r.today.from), this.stages(leads), this.repo.visits({ userId: me.id }, r.today.from, now),
      me.employeeId ? this.targets.rangeFigures(me, r.month.from, r.month.to, [r.p.month], me.employeeId) : [],
      me.employeeId ? this.targets.rangeFigures(me, r.quarter.from, r.quarter.to, r.p.quarterMonths, me.employeeId) : [],
    ]);
    const hide = me.fields.hidden("reports");
    return {
      day: r.p.today, today: { leads: newLeads, visits: count(visits, "visit"), meetings: count(visits, "meeting") }, stages,
      targets: month[0] && quarter[0] ? { month: barOf(teamProgress(month), hide), quarter: barOf(teamProgress(quarter), hide) } : null,
    };
  }

  /** 14.2 · a click on a person: his Showings, Meetings and target this week, month and quarter (within my scope). */
  async person(me: CurrentUser, employeeId: string, now = new Date()): Promise<PersonPerformance> {
    const cal = await this.time.calendar(), r = ranges(now, cal), hide = me.fields.hidden("reports");
    const periods = [
      { key: "week" as const, ...r.week, months: [] as string[] }, { key: "month" as const, ...r.month, months: [r.p.month] },
      { key: "quarter" as const, ...r.quarter, months: [...r.p.quarterMonths] },
    ];
    const figures = await Promise.all(periods.map((p) => this.targets.rangeFigures(me, p.from, p.to, p.months, employeeId)));
    const who = figures[0]![0];
    if (!who) throw new NotFoundException("السيلز ده مش موجود أو مش من حقك");
    const visits = await Promise.all(periods.map((p) => this.repo.visits({ userId: who.userId }, p.from, now)));
    return {
      employeeId: who.employeeId, name: who.name, team: who.team,
      periods: periods.map((p, i) => ({
        key: p.key, from: localDate(p.from, cal), to: localDate(new Date(p.to.getTime() - 1), cal), visits: count(visits[i]!, "visit"), meetings: count(visits[i]!, "meeting"),
        target: p.months.length ? barOf(teamProgress(figures[i]!), hide) : { ...barOf(teamProgress(figures[i]!), hide), goal: "" },
      })),
    };
  }

  private async stages(leads: never): Promise<StageCount[]> {
    const rows = await this.repo.stageCounts(leads, DASHBOARD_STAGES.map(toDb));
    return DASHBOARD_STAGES.map((stage) => ({ stage, count: rows.find((x) => x.stage === toDb(stage))?._count._all ?? 0 }));
  }

  /** 14.3 «Finance»: the safes and banks, who holds custody, the advances, what clients owe, this month's income, the broken budget lines. */
  private async finance() {
    const [cash, budget, income, { accounts, balance }] = await Promise.all([this.vouchers.cash(), this.vouchers.budget(), this.ledger.income("month"), this.ledger.balances()]);
    const sum = (xs: { balance: string }[]) => toDecimal(xs.reduce((s, x) => s + fromDecimal(x.balance), 0));
    const clients = accounts.find((a) => a.code === CLIENTS_PARENT);
    return {
      today: cash.today,
      figures: {
        balance: sum(cash.accounts), advances: sum(cash.advances), receivables: toDecimal(clients ? balance.get(clients.id) ?? 0 : 0), incomeMonth: income.revenue,
        custody: cash.custody.filter((h) => fromDecimal(h.balance) !== 0).map((h) => ({ userId: h.userId, name: h.name, balance: h.balance })),
        broken: budget.rows.filter((b) => b.active && budgetBroken(fromDecimal(b.spent), b.budget ? fromDecimal(b.budget) : null))
          .map((b) => ({ accountId: b.accountId, name: b.name, budget: b.budget ?? "", spent: b.spent, pct: b.pct })),
      },
    };
  }
}

/** Today, the office week, the month, the quarter and the year as [from, to) instants on the Cairo calendar. */
function ranges(now: Date, cal: WorkCalendar) {
  const p = dashboardPeriods(localDate(now, cal)), from = dayStart(p.today, cal);
  const months = (a: string, b: string) => ({ from: monthBounds(a, cal).from, to: monthBounds(b, cal).to });
  return {
    p, today: { from, to: new Date(from.getTime() + DAY) },
    week: { from: dayStart(p.week.from, cal), to: new Date(dayStart(p.week.to, cal).getTime() + DAY) },
    month: months(p.month, p.month), quarter: months(p.quarterMonths[0], p.quarterMonths[2]), year: months(p.yearMonths[0]!, p.yearMonths[11]!),
  };
}

/** The last Cairo day of a [from, to) window (its first when it's empty). */
const lastDay = (w: { from: Date; to: Date }, cal: WorkCalendar) => localDate(new Date(Math.max(w.from.getTime(), w.to.getTime() - 1)), cal);
const count = (rows: { kind: string; _count: { _all: number } }[], kind: string) => rows.filter((x) => x.kind === kind).reduce((n, x) => n + x._count._all, 0);
const byPercent = (a: { percent: number | null }, b: { percent: number | null }) => (b.percent ?? -1) - (a.percent ?? -1);

/** M-09 field permissions of «التقارير والتارجت»: a hidden amount comes blank, a hidden percent null. */
function barOf(t: { goal: Piasters; achieved: Piasters; percent: number | null }, hidden: ReadonlySet<string>): TargetBar {
  return { goal: hidden.has("value") ? "" : toDecimal(t.goal), achieved: hidden.has("achieved") ? "" : toDecimal(t.achieved), percent: hidden.has("percent") ? null : t.percent };
}
