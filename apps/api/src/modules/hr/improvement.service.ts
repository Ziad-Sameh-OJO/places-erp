import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { ImprovementPlanView, ImprovementView, PlanStep, SubmitPlan, TodayLine } from "@places/contracts";
import { DEFAULT_IMPROVEMENT_THRESHOLD, localDate, needsImprovement, planDue, planNext, type PlanStatus } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { KpisService } from "../kpis/kpis.service";
import type { Tx } from "./hr.repository";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
type Row = Prisma.ImprovementPlanGetPayload<object>;
const THRESHOLD = "improvementThreshold";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 10) / 10;
const WHO = { userId: true, teamLeader: { select: { userId: true } }, manager: { select: { userId: true } } } as const;
type Who = { userId: string; teamLeader: { userId: string } | null; manager: { userId: string } | null };

/**
 * M-05 · the improvement plan (HR 15 Nov). HR sees who is under `improvementThreshold` (70%) in the KPIs and asks that
 * person's KPI follower (else the Team Leader, else the manager) for a plan; he writes goals, actions and a due date and
 * sends it; HR follows it and closes it with a note. HR sees all; the TL only the plans asked of him; the employee none.
 * shortcut: the score is the live KPI card's (the quarter so far) — swap for the month's figure once KPIs keep one.
 */
@Injectable()
export class ImprovementService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly notifications: NotificationsService, private readonly kpis: KpisService) {}

  private isHr = (me: CurrentUser) => me.grants.scope === "all" && me.grants.can("hr", "edit");
  private month = () => localDate(new Date()).slice(0, 7);

  async threshold(): Promise<number> {
    const v = (await this.db.setting.findUnique({ where: { key: THRESHOLD } }))?.value;
    return typeof v === "number" ? v : DEFAULT_IMPROVEMENT_THRESHOLD;
  }

  private hrOnly(me: CurrentUser) {
    if (!this.isHr(me)) throw new ForbiddenException("خطط التحسين للـ HR");
  }

  async setThreshold(me: CurrentUser, threshold: number, run: Run) {
    this.hrOnly(me);
    const before = await this.threshold();
    return run(async (tx) => {
      await tx.setting.upsert({ where: { key: THRESHOLD }, create: { key: THRESHOLD, value: threshold }, update: { value: threshold } });
      await this.audit.record({ module: "hr", entity: "Setting", entityId: THRESHOLD, action: "update", userId: me.id, before: { threshold: before }, after: { threshold } }, tx);
      return { threshold };
    });
  }

  private async views(rows: Row[], me: CurrentUser): Promise<ImprovementPlanView[]> {
    const [emps, tls] = await Promise.all([
      this.db.employee.findMany({ where: { id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, name: true } }),
      this.db.employee.findMany({ where: { userId: { in: rows.map((r) => r.tlUserId) } }, select: { userId: true, name: true } }),
    ]);
    return rows.map((r) => {
      const st = r.status as PlanStatus;
      return { id: r.id, employeeId: r.employeeId, name: emps.find((e) => e.id === r.employeeId)?.name ?? "", month: r.month, score: Number(r.score), tl: tls.find((e) => e.userId === r.tlUserId)?.name ?? "",
        status: st, goals: r.goals, actions: r.actions, dueDate: r.dueDate ? iso(r.dueDate) : null, note: r.note,
        canSubmit: r.tlUserId === me.id && !!planNext(st, "submit"), canFollow: this.isHr(me) && !!planNext(st, "close") };
    });
  }

  /** HR: who's under the line this month and every plan; a TL: only the plans asked of him (scope in the query). */
  async view(me: CurrentUser): Promise<ImprovementView> {
    const hr = this.isHr(me), month = this.month(), threshold = await this.threshold();
    const rows = await this.db.improvementPlan.findMany({ where: hr ? {} : { tlUserId: me.id }, orderBy: { createdAt: "desc" }, take: 300 });
    if (!hr) return { month, threshold, candidates: [], plans: await this.views(rows, me) };
    const cards = (await this.kpis.liveCards()).filter((c) => needsImprovement(c.score, threshold));
    const emps = await this.db.employee.findMany({ where: { id: { in: cards.map((c) => c.employeeId) }, user: { status: "ACTIVE" } }, select: { id: true, name: true, ...WHO } });
    const fol = await this.followers(cards), card = (id: string) => cards.find((c) => c.employeeId === id)!;
    const tlOf = (e: (typeof emps)[number]) => this.tlOf(e, fol.get(card(e.id).followerId ?? ""));
    const tlNames = new Map((await this.db.employee.findMany({ where: { userId: { in: emps.map(tlOf).filter((x): x is string => !!x) } }, select: { userId: true, name: true } })).map((e) => [e.userId, e.name]));
    const candidates = emps.map((e) => {
      const p = rows.find((r) => r.employeeId === e.id && r.month === month), tl = tlOf(e);
      return { employeeId: e.id, name: e.name, score: round(card(e.id).score), tl: tl ? tlNames.get(tl) ?? null : null, planId: p?.id ?? null, status: (p?.status as PlanStatus | undefined) ?? null };
    }).sort((a, b) => a.score - b.score);
    return { month, threshold, candidates, plans: await this.views(rows, me) };
  }

  /** Who writes the plan: the KPI follower, else the Team Leader, else the manager (never the person himself). */
  private tlOf(e: Who, followerUserId: string | undefined): string | null {
    return [followerUserId, e.teamLeader?.userId, e.manager?.userId].find((u) => u && u !== e.userId) ?? null;
  }

  /** The KPI followers' user ids (cards name the follower's employee file). */
  private async followers(cards: { followerId: string | null }[]) {
    return new Map((await this.db.employee.findMany({ where: { id: { in: cards.map((c) => c.followerId ?? "") } }, select: { id: true, userId: true } })).map((e) => [e.id, e.userId]));
  }

  async request(me: CurrentUser, employeeId: string, run: Run): Promise<ImprovementPlanView> {
    this.hrOnly(me);
    const month = this.month(), threshold = await this.threshold();
    const card = (await this.kpis.liveCards()).find((c) => c.employeeId === employeeId);
    if (!card) throw new NotFoundException("الموظف ده مالوش كارت KPI");
    if (!needsImprovement(card.score, threshold)) throw new BadRequestException(`الـ KPI ${round(card.score)}% · مش تحت ${threshold}%`);
    const e = await this.db.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true, ...WHO } });
    if (!e) throw new NotFoundException("الموظف مش موجود");
    const tlUserId = this.tlOf(e, (await this.followers([card])).get(card.followerId ?? ""));
    if (!tlUserId) throw new BadRequestException("الموظف ده مالوش Team Leader ولا متابع KPI");
    const row = await run(async (tx) => {
      if (await tx.improvementPlan.findUnique({ where: { employeeId_month: { employeeId, month } } })) throw new ConflictException("اتطلبت خطة تحسين للموظف ده الشهر ده");
      const r = await tx.improvementPlan.create({ data: { employeeId, month, score: round(card.score), tlUserId, requestedById: me.id } });
      await this.audit.record({ module: "hr", entity: "ImprovementPlan", entityId: r.id, action: "create", userId: me.id, after: { employee: e.name, month, score: round(card.score), tlUserId } }, tx);
      return r;
    });
    await this.notifications.notify({ event: "hr.improvement_plan", to: [], userIds: [tlUserId], link: "/hr?tab=improve", text: `محتاج تحط خطة تحسين لـ ${e.name} · الـ KPI ${round(card.score)}%` });
    return (await this.views([row], me))[0]!;
  }

  /** The TL writes the plan and sends it to HR (again, until HR starts following it). */
  async submit(me: CurrentUser, id: string, p: SubmitPlan, run: Run): Promise<ImprovementPlanView> {
    if (p.dueDate < localDate(new Date())) throw new BadRequestException("ميعاد الخطة لازم يبقى النهارده أو بعده");
    const row = await run(async (tx) => {
      const r = await tx.improvementPlan.findFirst({ where: { id, tlUserId: me.id } });
      if (!r) throw new NotFoundException("الخطة مش موجودة");
      const next = planNext(r.status as PlanStatus, "submit");
      if (!next) throw new BadRequestException("الخطة دي في متابعة الـ HR خلاص");
      const o = await tx.improvementPlan.update({ where: { id }, data: { status: next, goals: p.goals, actions: p.actions, dueDate: new Date(`${p.dueDate}T00:00:00Z`), submittedAt: new Date() } });
      await this.audit.record({ module: "hr", entity: "ImprovementPlan", entityId: id, action: "submit", userId: me.id, before: { status: r.status, goals: r.goals, actions: r.actions, dueDate: r.dueDate ? iso(r.dueDate) : null }, after: { status: next, ...p } }, tx);
      return o;
    });
    const [v] = await this.views([row], me);
    await this.notifications.notify({ event: "hr.improvement_plan", link: "/hr?tab=improve", text: `${v!.tl} بعت خطة تحسين لـ ${v!.name} · لحد ${p.dueDate}` });
    return v!;
  }

  /** HR: «متابعة» then «قفل» with a note. */
  async step(me: CurrentUser, id: string, s: PlanStep, run: Run): Promise<ImprovementPlanView> {
    this.hrOnly(me);
    if (s.step === "close" && !s.note) throw new BadRequestException("اكتب ملاحظة القفل");
    const row = await run(async (tx) => {
      const r = await tx.improvementPlan.findUnique({ where: { id } });
      if (!r) throw new NotFoundException("الخطة مش موجودة");
      const next = planNext(r.status as PlanStatus, s.step);
      if (!next) throw new BadRequestException(r.status === "requested" ? "الـ Team Leader لسه مبعتش الخطة" : "الخطة دي مقفولة");
      const o = await tx.improvementPlan.update({ where: { id }, data: { status: next, ...(s.step === "close" ? { note: s.note ?? null, closedAt: new Date() } : {}) } });
      await this.audit.record({ module: "hr", entity: "ImprovementPlan", entityId: id, action: s.step, userId: me.id, before: { status: r.status }, after: { status: next, note: s.note ?? null } }, tx);
      return o;
    });
    return (await this.views([row], me))[0]!;
  }

  /** «مهامي النهارده»: the TL's plans to write; HR's plans sent to read and the ones whose due date came. */
  async todayLines(me: CurrentUser): Promise<TodayLine[]> {
    const hr = this.isHr(me), today = localDate(new Date());
    const rows = await this.db.improvementPlan.findMany({ where: { OR: [{ tlUserId: me.id, status: "requested" }, ...(hr ? [{ status: { in: ["submitted", "follow_up"] } }] : [])] }, orderBy: { createdAt: "asc" } });
    return (await this.views(rows, me)).flatMap((p): TodayLine[] => {
      if (p.status === "requested") return [{ kind: "planRequested", tone: "warn", id: p.id, values: { name: p.name, score: p.score } }];
      if (planDue(p.status, p.dueDate, today)) return [{ kind: "planDue", tone: "bad", id: p.id, values: { name: p.name, due: p.dueDate! } }];
      return p.status === "submitted" ? [{ kind: "planSubmitted", tone: "warn", id: p.id, values: { name: p.name, tl: p.tl } }] : [];
    });
  }
}
