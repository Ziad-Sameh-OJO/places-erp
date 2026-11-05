import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@places/db";
import type { Achievements, TargetInput, TargetsView, TeamRow, TransactionRow } from "@places/contracts";
import {
  behindPace, dayStart, dealRowOf, fromDecimal, localDate, monthBounds, monthLabel, periodFigures, ranked, targetPercent, teamResult, tlTiersOf, toDecimal,
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

  async view(me: CurrentUser, month?: string): Promise<TargetsView> {
    return { ...(await this.board(this.scope(me), month)), can: { edit: me.grants.can("reports", "edit"), approve: me.grants.can("reports", "approve") } };
  }

  /** M-02 5.10 «Achievements»: every salesperson's month and rank, which each of them sees (demo deals.js Leaderboard). */
  async leaderboard(me: CurrentUser, month?: string): Promise<Achievements> {
    const v = await this.board({}, month);
    return { month: v.month, label: v.label, mine: me.employeeId, rows: v.rows.map((r) => ({ ...r, pending: undefined })) };
  }

  private async board(where: Prisma.EmployeeWhereInput, month?: string): Promise<Omit<TargetsView, "can">> {
    const cal = await this.time.calendar(), today = localDate(new Date(), cal), cur = today.slice(0, 7), m = month ?? cur, b = monthBounds(m, cal);
    const people = await this.repo.salespeople(where);
    const ids = people.map((p) => p.id);
    const [targets, deals, visits, tiers] = await Promise.all([
      this.repo.targets(m, ids), this.repo.deals(ids, b.from, b.to), this.repo.visits(people.map((p) => p.userId), b.from, b.to), this.repo.setting("tlTiers"),
    ]);
    const rows = deals.map(dealRow);
    const gone = m < cur ? b.days : m > cur ? 0 : Number(today.slice(8, 10));
    const figures = people.map((p) => {
      const t = targets.find((x) => x.employeeId === p.id), goal = t ? piasters(t.value) : piasters(p.target);
      const f = periodFigures(p.id, rows, b.from, b.to), percent = targetPercent(f.achieved, goal);
      return {
        p, goal, share: f.share,
        row: {
          employeeId: p.id, name: p.name, team: p.team, tl: p.teamLeader?.name ?? null,
          value: toDecimal(goal), deals: t?.deals ?? 0, visits: t?.visits ?? 0, achieved: toDecimal(f.achieved), percent: Math.round(percent * 10) / 10,
          transactions: f.transactions, visitsDone: visits.find((v) => v.byUserId === p.userId)?._count._all ?? 0,
          behind: m === cur && behindPace(percent, gone, b.days), pending: pendingOf(t?.pending ?? null),
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
      month: m, label: monthLabel(m), dayPercent: Math.round((gone / b.days) * 100),
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
    const today = localDate(new Date(), await this.time.calendar()), cur = today.slice(0, 7);
    if (input.month < cur) throw new ConflictException("الشهر ده خلص · مفيش تعديل");
    const waits = input.month === cur && today.slice(8, 10) !== "01" && !me.grants.can("reports", "approve");
    const before = (await this.repo.targets(input.month, [p.id]))[0] ?? null;
    const values = { value: input.value, deals: input.deals, visits: input.visits };
    await this.db.$transaction(async (tx) => {
      const where = { employeeId_month: { employeeId: p.id, month: input.month } };
      if (waits) {
        const pending = { ...values, by: me.name };
        await tx.salesTarget.upsert({ where, create: { employeeId: p.id, month: input.month, value: p.target, pending }, update: { pending } });
      } else await tx.salesTarget.upsert({ where, create: { employeeId: p.id, month: input.month, ...values }, update: { ...values, pending: Prisma.DbNull } });
      await this.audit.record({ module: MODULE, entity: "SalesTarget", entityId: `${p.id}:${input.month}`, action: "update", userId: me.id,
        before, after: { ...values, waits, summary: `تارجت ${p.name} (${monthLabel(input.month)}) ${waits ? "مستني موافقة" : "بقى"} ${input.value}` } }, tx);
    });
    if (waits) await this.notifications.notify({ event: "target.change", text: `${me.name} عايز يغيّر تارجت ${p.name} (${monthLabel(input.month)}) لـ ${input.value} · مستني موافقتك`, link: LINK });
    return { pending: waits };
  }

  /** The approval of a change in the middle of the month («reports: approve»). */
  async approve(me: CurrentUser, employeeId: string, month: string) {
    const p = (await this.repo.salespeople(this.scope(me))).find((x) => x.id === employeeId);
    const t = p ? (await this.repo.targets(month, [employeeId]))[0] : null;
    const pending = pendingOf(t?.pending ?? null);
    if (!p || !t || !pending) throw new NotFoundException("مفيش تغيير مستني موافقة");
    await this.db.$transaction(async (tx) => {
      await tx.salesTarget.update({ where: { id: t.id }, data: { value: pending.value, deals: pending.deals, visits: pending.visits, pending: Prisma.DbNull } });
      await this.audit.record({ module: MODULE, entity: "SalesTarget", entityId: `${employeeId}:${month}`, action: "approve", userId: me.id,
        before: { value: t.value.toFixed(2), deals: t.deals, visits: t.visits }, after: { ...pending, summary: `اتوافق على تارجت ${p.name} (${monthLabel(month)}) ${pending.value}` } }, tx);
    });
  }

  /** «الـ Transactions» of a period: deals of my people whose first collection falls in it. */
  async transactions(me: CurrentUser, from: string, to: string): Promise<TransactionRow[]> {
    const cal = await this.time.calendar(), start = dayStart(from, cal), end = new Date(dayStart(to, cal).getTime() + 86_400_000);
    const people = await this.repo.salespeople(this.scope(me));
    const names = new Map(people.map((p) => [p.id, p.name]));
    const deals = await this.repo.deals([...names.keys()], start, end);
    return deals.flatMap((d) => {
      const first = d.payments.reduce<Date | null>((min, p) => (!min || p.receivedAt < min ? p.receivedAt : min), null);
      if (!first || first < start || first >= end) return [];
      return [{
        dealId: d.id, code: d.code, type: d.type, company: d.company, status: DEAL_STATUS[d.status] ?? d.status,
        collected: toDecimal(d.payments.reduce((s, p) => s + piasters(p.amount), 0)), firstAt: first.toISOString(),
        people: d.participants.map((x) => `${names.get(x.employeeId) ?? "—"} (${x.side === "BUYER" ? "Buyer" : "Seller"})`).join("، "),
      }];
    });
  }
}
