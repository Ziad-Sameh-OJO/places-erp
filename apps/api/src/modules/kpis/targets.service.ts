import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@places/db";
import type { Achievements, TargetInput, TargetPlan, TargetPlanResult, TargetPlanSave, TargetsView, TeamRow, TransactionRow } from "@places/contracts";
import {
  behindPace, dayStart, monthLock, quarterLabel, yearMonths, dealRowOf, fromDecimal, localDate, monthBounds, monthLabel, periodFigures, quarterMonths, ranked, targetPercent, teamResult, tlTiersOf, toDecimal,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { type DealRecord, ReportsRepository } from "./reports.repository";

const MODULE = "reports";
const LINK = "/reports";
const DEAL_STATUS: Record<string, string> = {
  PENDING_REVIEW: "Pending Review", APPROVED: "Approved", PARTIALLY_COLLECTED: "Partially Collected", FULLY_COLLECTED: "Fully Collected", REJECTED: "Rejected", CANCELLED: "Cancelled",
};
const piasters = (d: Prisma.Decimal) => fromDecimal(d.toFixed(2));
const dealRow = (d: DealRecord) => dealRowOf({
  ...d, commissionOwner: d.commissionOwner.toFixed(2), commissionClient: d.commissionClient.toFixed(2), targetBase: d.targetBase?.toFixed(2) ?? null,
  payments: d.payments.map((p) => ({ ...p, amount: p.amount.toFixed(2) })),
});
interface Pending { value: string; deals: number; visits: number; by: string }
const pendingOf = (v: Prisma.JsonValue | null): Pending | null => (v && typeof v === "object" && !Array.isArray(v) && typeof v.value === "string" ? (v as unknown as Pending) : null);

/**
 * M-12 · 11.8: the monthly target of every salesperson (value, Transactions, visits) and of every team (the sum of its
 * salespeople's), the TL report, the Transactions of a period and the ranking. Achievements are read from the deals and
 * their collections (sales.Deal · DealParticipant · Payment); nothing here writes a deal.
 */
@Injectable()
export class TargetsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: ReportsRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly time: BusinessTimeService,
  ) {}

  /** The data scope goes into the query: the TL his team, the Sales Director his department, management everyone. */
  private scope(me: CurrentUser): Prisma.EmployeeWhereInput {
    switch (me.grants.scope) {
      case "all": return {};
      case "dept": return { department: me.department ?? "-" };
      case "team": return { OR: [{ id: { in: me.teamIds } }, { teamLeaderId: me.employeeId ?? "-" }] };
      case "own": return { id: me.employeeId ?? "-" };
    }
  }

  /** 14.12: with `period` («2025-Q4») the quarter's three months added up; targets are set per month, so it's read only. */
  async view(me: CurrentUser, month?: string, period: string | null = null): Promise<TargetsView> {
    const v = hideFields(await this.board(this.scope(me), month, period), me.fields.hidden(MODULE));
    return { ...v, can: { edit: !period && me.grants.can("reports", "edit"), approve: !period && me.grants.can("reports", "approve") } };
  }

  /** M-02 5.10 «Achievements»: every salesperson's month and rank, which each of them sees (demo deals.js Leaderboard). */
  async leaderboard(me: CurrentUser, month?: string): Promise<Achievements> {
    const v = await this.board({}, month);
    return { month: v.month, label: v.label, mine: me.employeeId, rows: v.rows.map((r) => ({ ...r, pending: undefined })) };
  }

  private async board(where: Prisma.EmployeeWhereInput, month?: string, period: string | null = null): Promise<Omit<TargetsView, "can">> {
    const cal = await this.time.calendar(), today = localDate(new Date(), cal), cur = today.slice(0, 7), m = month ?? cur;
    const months = period ? quarterMonths(period) : [m], b = { from: monthBounds(months[0]!, cal).from, to: monthBounds(months.at(-1)!, cal).to, days: months.reduce((n, x) => n + monthBounds(x, cal).days, 0) };
    const people = await this.repo.salespeople(where);
    const ids = people.map((p) => p.id);
    const [monthTargets, deals, visits, tiers, units, acts] = await Promise.all([
      Promise.all(months.map((x) => this.repo.targets(x, ids))), this.repo.deals(ids, b.from, b.to), this.repo.visits(people.map((p) => p.userId), b.from, b.to), this.repo.setting("tlTiers"),
      this.repo.unitsBrought(ids, b.from, b.to), this.repo.activitiesDone(ids, b.from, b.to),
    ]);
    const visitsOf = (userId: string, kind: string) => visits.filter((v) => v.byUserId === userId && v.kind === kind).reduce((n, v) => n + v._count._all, 0);
    const actsOf = (id: string, kind: string) => acts.filter((a) => a.employeeId === id && a.kind.toLowerCase() === kind).reduce((n, a) => n + a._count._all, 0);
    const rows = deals.map(dealRow);
    const gone = period ? (b.to.getTime() <= Date.now() ? b.days : b.from.getTime() > Date.now() ? 0 : Math.ceil((Date.now() - b.from.getTime()) / 86_400_000))
      : m < cur ? b.days : m > cur ? 0 : Number(today.slice(8, 10));
    const targets = monthTargets[0]!, live = !period && m === cur;
    const figures = people.map((p) => {
      const t = period ? undefined : targets.find((x) => x.employeeId === p.id);
      // a quarter: each month's target, or his standing target for a month without one (as the quarterly sheet, 11.18)
      const mt = monthTargets.map((ts) => ts.find((x) => x.employeeId === p.id));
      const goal = mt.reduce((s, x) => s + (x ? piasters(x.value) : piasters(p.target)), 0);
      const f = periodFigures(p.id, rows, b.from, b.to), percent = targetPercent(f.achieved, goal);
      return {
        p, goal, share: f.share,
        row: {
          employeeId: p.id, name: p.name, team: p.team, tl: p.teamLeader?.name ?? null,
          value: toDecimal(goal), deals: mt.reduce((n, x) => n + (x?.deals ?? 0), 0), visits: mt.reduce((n, x) => n + (x?.visits ?? 0), 0), achieved: toDecimal(f.achieved), percent: Math.round(percent * 10) / 10,
          transactions: f.transactions, visitsDone: visitsOf(p.userId, "visit"), meetings: visitsOf(p.userId, "meeting"),
          inventory: units.find((u) => u.agentId === p.id)?._count._all ?? 0, farming: actsOf(p.id, "farming"), approach: actsOf(p.id, "approach"),
          behind: live && behindPace(percent, gone, b.days), pending: pendingOf(t?.pending ?? null),
        },
        achieved: f.achieved,
      };
    });
    const tlTiers = tlTiersOf(tiers);
    const teams: TeamRow[] = [];
    for (const tlId of [...new Set(people.flatMap((p) => (p.teamLeaderId ? [p.teamLeaderId] : [])))]) {
      const members = figures.filter((f) => f.p.teamLeaderId === tlId), tl = members[0]!.p.teamLeader!;
      const res = tlTiers.length ? teamResult(members.map((x) => ({ goal: x.goal, achieved: x.achieved, shareOfCollections: x.share })), tlTiers) : null;
      const goal = members.reduce((s, x) => s + x.goal, 0), got = members.reduce((s, x) => s + x.achieved, 0);
      teams.push({
        tlId, tl: tl.name, team: tl.team ?? members[0]!.p.team, members: members.map((x) => x.p.id),
        goal: toDecimal(goal), achieved: toDecimal(got), percent: Math.round(targetPercent(got, goal) * 10) / 10,
        avg: Math.round((members.reduce((s, x) => s + x.row.percent, 0) / members.length) * 10) / 10,
        tierPercent: res?.tier.percent ?? 0, commission: toDecimal(res?.commission ?? 0),
      });
    }
    return {
      month: period ?? m, label: period ? quarterLabel(period) : monthLabel(m), dayPercent: Math.round((gone / b.days) * 100),
      rows: ranked(figures.map((f) => f.row)), teams: teams.sort((a, b2) => b2.percent - a.percent),
    };
  }

  /**
   * «التارجت»: a past month is closed; the current month after its first day changes only with approval (11.8) unless the
   * one changing it may approve; a coming month changes at once.
   */
  async setTarget(me: CurrentUser, input: TargetInput) {
    const p = (await this.repo.salespeople(this.scope(me))).find((x) => x.id === input.employeeId);
    if (!p) throw new NotFoundException("السيلز ده مش موجود أو مش من حقك");
    const today = localDate(new Date(), await this.time.calendar());
    const lock = monthLock(input.month, today, me.grants.can("reports", "approve"));
    if (lock === "closed") throw new ConflictException("الشهر ده خلص · مفيش تعديل");
    const before = (await this.repo.targets(input.month, [p.id]))[0] ?? null;
    const waits = lock === "approval";
    const value = await this.db.$transaction((tx) => this.apply(tx, me, p, input.month, before, { value: input.value, deals: input.deals, visits: input.visits }, waits));
    if (waits) await this.notifications.notify({ event: "target.change", text: `${me.name} عايز يغيّر تارجت ${p.name} (${monthLabel(input.month)}) لـ ${value} · مستني موافقتك`, link: LINK });
    return { pending: waits };
  }

  /** «خطة التارجت»: a year of my people's monthly targets; a month with none saved shows the standing target. */
  async plan(me: CurrentUser, year: number): Promise<TargetPlan> {
    const today = localDate(new Date(), await this.time.calendar()), approve = me.grants.can("reports", "approve");
    const people = await this.repo.salespeople(this.scope(me)), months = yearMonths(year);
    const saved = await this.db.salesTarget.findMany({ where: { month: { in: months }, employeeId: { in: people.map((p) => p.id) } } });
    const hidesValue = me.fields.hidden(MODULE).has("value");
    return {
      year, months: months.map((m) => ({ month: m, lock: monthLock(m, today, approve) })),
      people: people.map((p) => ({
        employeeId: p.id, name: p.name, team: p.teamLeader?.team ?? p.team, tl: p.teamLeader?.name ?? null,
        cells: Object.fromEntries(months.map((m) => {
          const s = saved.find((x) => x.employeeId === p.id && x.month === m), pending = pendingOf(s?.pending ?? null);
          return [m, {
            value: hidesValue ? "" : (s?.value ?? p.target).toFixed(2), deals: s?.deals ?? 0, visits: s?.visits ?? 0, saved: !!s,
            pending: pending && (hidesValue ? { ...pending, value: "" } : pending),
          }];
        })),
      })),
      can: { edit: me.grants.can("reports", "edit"), approve, value: !hidesValue && !me.fields.fixed(MODULE).has("value") },
    };
  }

  /**
   * Many cells of one metric in one go, each by the month rule (11.8): a closed month or a value the person may not change
   * is skipped, the current month waits for approval, the rest is saved; one audit line per cell, one notification.
   */
  async savePlan(me: CurrentUser, input: TargetPlanSave): Promise<TargetPlanResult> {
    if (input.metric === "value" && (me.fields.fixed(MODULE).has("value") || me.fields.hidden(MODULE).has("value"))) throw new ForbiddenException("مش من حقك تغيّر قيمة التارجت");
    const people = new Map((await this.repo.salespeople(this.scope(me))).map((p) => [p.id, p]));
    if (input.cells.some((c) => !people.has(c.employeeId))) throw new NotFoundException("فيه سيلز مش موجود أو مش من حقك");
    const today = localDate(new Date(), await this.time.calendar()), approve = me.grants.can("reports", "approve");
    const months = [...new Set(input.cells.map((c) => c.month))];
    const stored = await this.db.salesTarget.findMany({ where: { month: { in: months }, employeeId: { in: [...people.keys()] } } });
    let saved = 0, skipped = 0;
    const waiting: string[] = [];
    await this.db.$transaction(async (tx) => {
      for (const c of input.cells) {
        const lock = monthLock(c.month, today, approve);
        if (lock === "closed") { skipped++; continue; }
        const p = people.get(c.employeeId)!, before = stored.find((s) => s.employeeId === p.id && s.month === c.month) ?? null;
        // the other two metrics stay as they are (or as they wait for approval)
        const base = pendingOf(before?.pending ?? null) ?? { value: (before?.value ?? p.target).toFixed(2), deals: before?.deals ?? 0, visits: before?.visits ?? 0 };
        const next = { value: base.value, deals: base.deals, visits: base.visits, [input.metric]: input.metric === "value" ? Number(c.amount).toFixed(2) : Number(c.amount) };
        await this.apply(tx, me, p, c.month, before, next, lock === "approval");
        if (lock === "approval") waiting.push(`${p.name} (${monthLabel(c.month)})`); else saved++;
      }
    }, { timeout: 60_000 });
    if (waiting.length) await this.notifications.notify({ event: "target.change", text: `${me.name} عايز يغيّر تارجت ${waiting.slice(0, 5).join("، ")}${waiting.length > 5 ? ` و${waiting.length - 5} كمان` : ""} · مستني موافقتك`, link: LINK });
    return { saved, pending: waiting.length, skipped };
  }

  /** One salesperson's month: saved, or kept aside for approval; audited either way. Returns the value written. */
  private async apply(tx: Prisma.TransactionClient, me: CurrentUser, p: { id: string; name: string; target: Prisma.Decimal }, month: string,
    before: { value: Prisma.Decimal; deals: number; visits: number } | null, input: { value: string; deals: number; visits: number }, waits: boolean) {
    // M-09: a value the person may not change stays as stored (or the salesperson's own target, for a new month)
    const value = me.fields.fixed(MODULE).has("value") ? (before?.value ?? p.target).toFixed(2) : input.value;
    const values = { value, deals: input.deals, visits: input.visits };
    const where = { employeeId_month: { employeeId: p.id, month } };
    if (waits) {
      const pending = { ...values, by: me.name };
      await tx.salesTarget.upsert({ where, create: { employeeId: p.id, month, value: p.target, pending }, update: { pending } });
    } else await tx.salesTarget.upsert({ where, create: { employeeId: p.id, month, ...values }, update: { ...values, pending: Prisma.DbNull } });
    await this.audit.record({ module: MODULE, entity: "SalesTarget", entityId: `${p.id}:${month}`, action: "update", userId: me.id,
      before, after: { ...values, waits, summary: `تارجت ${p.name} (${monthLabel(month)}) ${waits ? "مستني موافقة" : "بقى"} ${value}` } }, tx);
    return value;
  }

  /** The approval of a change in the middle of the month («reports: approve»). */
  async approve(me: CurrentUser, employeeId: string, month: string) {
    if (me.fields.fixed(MODULE).has("value")) throw new ForbiddenException("مش من حقك تغيّر قيمة التارجت"); // M-09: approving sets the value
    const p =(await this.repo.salespeople(this.scope(me))).find((x) => x.id === employeeId);
    const t = p ? (await this.repo.targets(month, [employeeId]))[0] : null;
    const pending = pendingOf(t?.pending ?? null);
    if (!p || !t || !pending) throw new NotFoundException("مفيش تغيير مستني موافقة");
    await this.db.$transaction(async (tx) => {
      await tx.salesTarget.update({ where: { id: t.id }, data: { value: pending.value, deals: pending.deals, visits: pending.visits, pending: Prisma.DbNull } });
      await this.audit.record({ module: MODULE, entity: "SalesTarget", entityId: `${employeeId}:${month}`, action: "approve", userId: me.id,
        before: { value: t.value.toFixed(2), deals: t.deals, visits: t.visits }, after: { ...pending, summary: `اتوافق على تارجت ${p.name} (${monthLabel(month)}) ${pending.value}` } }, tx);
    });
  }

  /**
   * 5.8 · M-12 3.2: each of these TLs' commission for a month, the TL report's figure (the tier the team reached × the
   * team's share of what was collected). Read inside the caller's transaction, so a collection being recorded counts.
   */
  async tlCommissions(tlIds: string[], month: string, tx: Prisma.TransactionClient) {
    const tiers = tlTiersOf(await this.repo.setting("tlTiers"));
    if (!tiers.length || !tlIds.length) return [];
    const b = monthBounds(month, await this.time.calendar());
    const people = await this.repo.salespeople({ teamLeaderId: { in: tlIds } }, tx);
    const ids = people.map((p) => p.id);
    const targets = await this.repo.targets(month, ids, tx);
    const rows = (await this.repo.deals(ids, b.from, b.to, tx)).map(dealRow);
    return tlIds.flatMap((tlId) => {
      const members = people.filter((p) => p.teamLeaderId === tlId);
      if (!members.length) return [];
      const res = teamResult(members.map((p) => {
        const t = targets.find((x) => x.employeeId === p.id), f = periodFigures(p.id, rows, b.from, b.to);
        return { goal: t ? piasters(t.value) : piasters(p.target), achieved: f.achieved, shareOfCollections: f.share };
      }), tiers);
      return [{ tlId, name: members[0]!.teamLeader!.name, commission: res.commission }];
    });
  }

  /** «الـ Transactions» of a period: deals of my people whose first collection falls in it. */
  async transactions(me: CurrentUser, from: string, to: string): Promise<TransactionRow[]> {
    const cal = await this.time.calendar(), start = dayStart(from, cal), end = new Date(dayStart(to, cal).getTime() + 86_400_000);
    const people = await this.repo.salespeople(this.scope(me));
    const names = new Map(people.map((p) => [p.id, p.name]));
    const deals = await this.repo.deals([...names.keys()], start, end), hidesCollected = me.fields.hidden(MODULE).has("collected");
    return deals.flatMap((d) => {
      const first = d.payments.reduce<Date | null>((min, p) => (!min || p.receivedAt < min ? p.receivedAt : min), null);
      if (!first || first < start || first >= end) return [];
      return [{
        dealId: d.id, code: d.code, type: d.type, company: d.company, status: DEAL_STATUS[d.status] ?? d.status,
        collected: hidesCollected ? "" : toDecimal(d.payments.reduce((s, p) => s + piasters(p.amount), 0)), firstAt: first.toISOString(),
        people: d.participants.map((x) => `${names.get(x.employeeId) ?? "—"} (${x.side === "BUYER" ? "Buyer" : "Seller"})`).join("، "),
      }];
    });
  }

  /**
   * 14.2 · 14.3 the dashboards: each salesperson in my scope (or the one asked for) with his goal and what he achieved
   * in [from, to). The goal is the months' targets added up (11.18: else his standing target); no months (a week) = no goal.
   */
  async rangeFigures(me: CurrentUser, from: Date, to: Date, months: readonly string[], employeeId?: string) {
    const people = await this.repo.salespeople(employeeId ? { AND: [this.scope(me), { id: employeeId }] } : this.scope(me));
    const ids = people.map((p) => p.id);
    const [targets, deals] = await Promise.all([Promise.all(months.map((m) => this.repo.targets(m, ids))).then((x) => x.flat()), this.repo.deals(ids, from, to)]);
    const rows = deals.map(dealRow);
    return people.map((p) => ({
      employeeId: p.id, userId: p.userId, name: p.name, team: p.teamLeader?.team ?? p.team, tlId: p.teamLeaderId, tl: p.teamLeader?.name ?? null,
      goal: months.reduce((s, m) => s + piasters(targets.find((t) => t.employeeId === p.id && t.month === m)?.value ?? p.target), 0),
      achieved: periodFigures(p.id, rows, from, to).achieved,
    }));
  }

  /**
   * M-05 «المسار الوظيفي»: each person's target achievement over a quarter's three months, as the quarterly sheet reads
   * it (11.18: the months' targets added up, else the person's standing target). null = no target («مالوش تارجت»).
   */
  async quarterPercents(quarter: string, employeeIds: string[]): Promise<Map<string, number | null>> {
    const cal = await this.time.calendar(), months = quarterMonths(quarter), from = monthBounds(months[0], cal).from, to = monthBounds(months[2], cal).to;
    const [people, targets, deals] = await Promise.all([
      this.db.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, target: true } }),
      Promise.all(months.map((m) => this.repo.targets(m, employeeIds))).then((x) => x.flat()),
      this.repo.deals(employeeIds, from, to),
    ]);
    const rows = deals.map(dealRow);
    return new Map(people.map((p) => {
      const goal = months.reduce((s, m) => s + piasters(targets.find((t) => t.employeeId === p.id && t.month === m)?.value ?? p.target), 0);
      return [p.id, goal > 0 ? Math.round(targetPercent(periodFigures(p.id, rows, from, to).achieved, goal) * 10) / 10 : null];
    }));
  }
}

/**
 * M-09 field permissions: a hidden field's value never leaves the API (blank, its kind kept), with what it gives away
 * (the percent from the target and what's achieved). The ranking stays: it's the order, not the money.
 */
function hideFields(v: Omit<TargetsView, "can">, hidden: ReadonlySet<string>): Omit<TargetsView, "can"> {
  if (!hidden.size) return v;
  const h = (k: string) => hidden.has(k);
  return {
    ...v,
    rows: v.rows.map((r) => ({
      ...r, value: h("value") ? "" : r.value, pending: h("pending") ? null : r.pending, achieved: h("achieved") ? "" : r.achieved,
      percent: h("percent") ? 0 : r.percent, behind: h("behind") ? false : r.behind,
    })),
    teams: v.teams.map((x) => ({
      ...x, goal: h("goal") ? "" : x.goal, achieved: h("achieved") ? "" : x.achieved, percent: h("percent") ? 0 : x.percent, avg: h("avg") ? 0 : x.avg,
      commission: h("commission") ? "" : x.commission, tierPercent: h("tierPercent") ? 0 : x.tierPercent,
    })),
  };
}
