import { Injectable, NotFoundException } from "@nestjs/common";
import { UnitFilters, type CompanyDashboard, type DashPerson, type DashboardLayoutView, type MyDashboard, type PersonPerformance, type StageCount, type TargetBar } from "@places/contracts";
import {
  CLIENTS_PARENT, DASHBOARD_STAGES, budgetBroken, dashboardLayout, dashboardPeriods, dayStart, fromDecimal, isCampaignLive, lateWithoutExcuse, localDate,
  monthBounds, opensOnDashboard, targetProgress, teamProgress, toDecimal, topAchiever, topSales, type Piasters, type WorkCalendar,
} from "@places/domain";
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

const count = (rows: { kind: string; _count: { _all: number } }[], kind: string) => rows.filter((x) => x.kind === kind).reduce((n, x) => n + x._count._all, 0);
const byPercent = (a: { percent: number | null }, b: { percent: number | null }) => (b.percent ?? -1) - (a.percent ?? -1);

/** M-09 field permissions of «التقارير والتارجت»: a hidden amount comes blank, a hidden percent null. */
function barOf(t: { goal: Piasters; achieved: Piasters; percent: number | null }, hidden: ReadonlySet<string>): TargetBar {
  return { goal: hidden.has("value") ? "" : toDecimal(t.goal), achieved: hidden.has("achieved") ? "" : toDecimal(t.achieved), percent: hidden.has("percent") ? null : t.percent };
}
