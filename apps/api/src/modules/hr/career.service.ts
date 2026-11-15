import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CareerMoveInput, CareerRowView, CareerTrackInput, CareerTrackView, CareerView } from "@places/contracts";
import { localDate, monthsBetween, promotionCheck, type QuarterResult } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { KpisService } from "../kpis/kpis.service";
import { TargetsService } from "../kpis/targets.service";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const LEVELS = { include: { levels: { orderBy: { position: "asc" } } } } as const;
type Track = Prisma.CareerTrackGetPayload<typeof LEVELS>;
type Level = Track["levels"][number];
const ruleOf = (l: Level) => ({ quarters: l.quarters ?? 1, minKpi: l.minKpi ?? 0, minTarget: l.minTarget ?? 0, minMonths: l.minMonths });

/**
 * M-05 · «المسار الوظيفي» (HR, 15 Nov): the tracks and levels HR defines with the rule to reach each level, every
 * employee's current level (the latest of their history) and whether they're due a promotion: promotionCheck() over the
 * closed quarters' KPI final scores (KpisService) and target achievement (TargetsService). Every change is audited.
 */
@Injectable()
export class CareerService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly kpis: KpisService, private readonly targets: TargetsService) {}

  private scope(me: CurrentUser): Prisma.EmployeeWhereInput {
    switch (me.grants.scope) {
      case "all": return {};
      case "dept": return me.department ? { department: me.department } : { userId: me.id };
      case "team": return { id: { in: me.teamIds } };
      case "own": return { userId: me.id };
    }
  }
  private isHr = (me: CurrentUser) => me.grants.scope === "all" && me.grants.can("hr", "edit");

  private trackView(t: Track): CareerTrackView {
    return { id: t.id, name: t.name, sample: t.sample, levels: t.levels.map((l, i) => ({ id: l.id, name: l.name, position: l.position, rule: i === 0 ? null : ruleOf(l) })) };
  }

  async view(me: CurrentUser): Promise<CareerView> {
    const [tracks, emps] = await Promise.all([
      this.db.careerTrack.findMany({ ...LEVELS, orderBy: { name: "asc" } }),
      this.db.employee.findMany({
        where: { AND: [this.scope(me), { user: { status: "ACTIVE" } }] }, orderBy: { name: "asc" },
        select: { id: true, name: true, jobTitle: true, careerMoves: { orderBy: [{ day: "desc" }, { createdAt: "desc" }], include: { level: { include: { track: { select: { name: true } } } } } } },
      }),
    ]);
    const levels = new Map(tracks.flatMap((t) => t.levels.map((l, i) => [l.id, { l, next: t.levels[i + 1] ?? null }] as const)));
    // the longest rule decides how many closed quarters to read
    const closed = await this.kpis.closedScores(Math.max(1, ...tracks.flatMap((t) => t.levels.slice(1).map((l) => l.quarters ?? 1))));
    const ids = emps.map((e) => e.id);
    const percents = await Promise.all(closed.map((q) => this.targets.quarterPercents(q.quarter, ids)));
    const byIds = [...new Set(emps.flatMap((e) => e.careerMoves.map((m) => m.byUserId)))];
    const by = new Map((await this.db.employee.findMany({ where: { userId: { in: byIds } }, select: { userId: true, name: true } })).map((u) => [u.userId, u.name]));
    const today = localDate(new Date());

    const rows = emps.map((e): CareerRowView => {
      const cur = e.careerMoves[0], at = cur ? levels.get(cur.levelId) : undefined;
      const history = e.careerMoves.map((m) => ({ id: m.id, level: m.level.name, track: m.level.track.name, day: iso(m.day), kind: m.kind === "promotion" ? "promotion" as const : "set" as const, note: m.note, by: by.get(m.byUserId) ?? "—" }));
      const base = { employeeId: e.id, name: e.name, jobTitle: e.jobTitle, history };
      if (!cur || !at) return { ...base, trackId: null, level: null, next: null, status: "noLevel", rule: null, monthsInLevel: null, check: null };
      const level = { id: at.l.id, name: at.l.name, since: iso(cur.day) }, monthsInLevel = monthsBetween(level.since, today);
      if (!at.next) return { ...base, trackId: at.l.trackId, level, next: null, status: "top", rule: null, monthsInLevel, check: null };
      const rule = ruleOf(at.next);
      const results: QuarterResult[] = closed.map((q, i) => ({ quarter: q.quarter, kpi: q.scores.get(e.id) ?? null, target: percents[i]!.get(e.id) ?? null }));
      const c = promotionCheck(rule, results, monthsInLevel);
      return { ...base, trackId: at.l.trackId, level, next: { id: at.next.id, name: at.next.name }, status: c.status, rule, monthsInLevel,
        check: { kpi: c.kpi, target: c.target, months: c.months, streak: c.streak, quarters: c.quarters.map((q) => ({ ...q })) } };
    });
    return { tracks: tracks.map((t) => this.trackView(t)), rows, lastClosed: closed[0]?.quarter ?? null, canEdit: this.isHr(me) };
  }

  /** «مهامي النهارده»: the people due a promotion after the latest closed quarter (HR). */
  async due(me: CurrentUser) {
    return (await this.view(me)).rows.filter((r) => r.status === "due");
  }

  /** A new track (no `id`) or an edit of one: the levels in order; a level someone is on can't be removed. */
  async saveTrack(me: CurrentUser, id: string | null, input: CareerTrackInput): Promise<CareerTrackView> {
    if (!this.isHr(me)) throw new ForbiddenException("المسار الوظيفي بيعدّله الـ HR");
    return this.db.$transaction(async (tx) => {
      const before = id ? await tx.careerTrack.findUnique({ where: { id }, ...LEVELS }) : null;
      if (id && !before) throw new NotFoundException("المسار ده مش موجود");
      if (await tx.careerTrack.findFirst({ where: { name: input.name, ...(id ? { id: { not: id } } : {}) } })) throw new ConflictException("فيه مسار بنفس الاسم");
      const keep = new Set(input.levels.flatMap((l) => (l.id ? [l.id] : [])));
      if ([...keep].some((k) => !before?.levels.some((l) => l.id === k))) throw new NotFoundException("المستوى ده مش في المسار ده");
      const gone = before?.levels.filter((l) => !keep.has(l.id)) ?? [];
      if (gone.length && (await tx.careerMove.count({ where: { levelId: { in: gone.map((l) => l.id) } } }))) throw new ConflictException("مينفعش تشيل مستوى عليه موظفين");
      const track = before
        ? await tx.careerTrack.update({ where: { id: before.id }, data: { name: input.name } })
        : await tx.careerTrack.create({ data: { name: input.name } });
      await tx.careerLevel.deleteMany({ where: { id: { in: gone.map((l) => l.id) } } });
      // out of the way first, so reordering never trips the (track, position) unique key
      for (const [i, l] of (before?.levels ?? []).entries()) if (keep.has(l.id)) await tx.careerLevel.update({ where: { id: l.id }, data: { position: -1 - i } });
      for (const [position, l] of input.levels.entries()) {
        const data = { name: l.name, position, ...(position === 0 ? { quarters: null, minKpi: null, minTarget: null, minMonths: null } : { quarters: l.quarters, minKpi: l.minKpi, minTarget: l.minTarget, minMonths: l.minMonths }) };
        if (l.id) await tx.careerLevel.update({ where: { id: l.id }, data });
        else await tx.careerLevel.create({ data: { ...data, trackId: track.id } });
      }
      const after = this.trackView((await tx.careerTrack.findUniqueOrThrow({ where: { id: track.id }, ...LEVELS })));
      await this.audit.record({ module: "hr", entity: "CareerTrack", entityId: track.id, action: before ? "update" : "create", userId: me.id,
        before: before ? this.trackView(before) : undefined, after }, tx);
      return after;
    });
  }

  async deleteTrack(me: CurrentUser, id: string) {
    if (!this.isHr(me)) throw new ForbiddenException("المسار الوظيفي بيعدّله الـ HR");
    await this.db.$transaction(async (tx) => {
      const t = await tx.careerTrack.findUnique({ where: { id }, ...LEVELS });
      if (!t) throw new NotFoundException("المسار ده مش موجود");
      if (await tx.careerMove.count({ where: { level: { trackId: id } } })) throw new ConflictException("مينفعش تمسح مسار عليه موظفين");
      await tx.careerTrack.delete({ where: { id } });
      await this.audit.record({ module: "hr", entity: "CareerTrack", entityId: id, action: "delete", userId: me.id, before: this.trackView(t) }, tx);
    });
  }

  /** HR sets someone's level or records a promotion: kept in their history, and it becomes their current level. */
  async move(me: CurrentUser, input: CareerMoveInput) {
    if (!me.grants.can("hr", "edit")) throw new ForbiddenException("المسار الوظيفي بيعدّله الـ HR");
    return this.db.$transaction(async (tx) => {
      const e = await tx.employee.findFirst({ where: { AND: [{ id: input.employeeId }, this.scope(me)] }, select: { id: true, name: true } });
      if (!e) throw new NotFoundException("الموظف ده مش موجود أو مش من حقك");
      const level = await tx.careerLevel.findUnique({ where: { id: input.levelId }, include: { track: { select: { name: true } } } });
      if (!level) throw new NotFoundException("المستوى ده مش موجود");
      const prev = await tx.careerMove.findFirst({ where: { employeeId: e.id }, orderBy: [{ day: "desc" }, { createdAt: "desc" }], include: { level: { select: { name: true } } } });
      const m = await tx.careerMove.create({ data: { employeeId: e.id, levelId: level.id, day: new Date(`${input.day}T00:00:00Z`), kind: input.kind, note: input.note || null, byUserId: me.id } });
      await this.audit.record({ module: "hr", entity: "CareerMove", entityId: m.id, action: input.kind === "promotion" ? "promote" : "update", userId: me.id,
        before: { employee: e.name, level: prev?.level.name ?? null }, after: { employee: e.name, track: level.track.name, level: level.name, day: input.day, note: input.note ?? null } }, tx);
      return { id: m.id };
    });
  }
}
