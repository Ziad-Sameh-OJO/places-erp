import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { TaskKpiEffect, TeamMember, TeamTaskInput, TeamTaskView } from "@places/contracts";
import { TEAM_TASKS_PER_DAY, dayStart, localDate, teamTaskRoom } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { KpisService } from "../kpis/kpis.service";

const KIND = "team"; // domain TASK_KINDS: given only here, capped at 30 a day
type TaskRow = Prisma.TaskGetPayload<object>;
/** A `@db.Date` column holds the Cairo calendar day as UTC midnight. */
const calendarDay = (d: Date) => new Date(`${localDate(d)}T00:00:00Z`);

/**
 * 2.16 · M-03 3.1: Manar's daily tasks to her team (Randa, Sara, Marwa — the people who report to her), at most 30 a
 * day each; they see theirs on their home page and mark them done. Both ends feed the KPIs (M-12).
 */
@Injectable()
export class TeamTasksService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly kpis: KpisService,
  ) {}

  /** The people who report to me, with today's count. */
  async team(me: CurrentUser): Promise<TeamMember[]> {
    const people = await this.reports(me);
    const today = await this.givenToday(people.map((p) => p.userId), new Date());
    return people.map((p) => ({ id: p.userId, name: p.name, today: today.get(p.userId) ?? 0, room: teamTaskRoom(today.get(p.userId) ?? 0) }));
  }

  /** What I gave: today's tasks and the ones still open from before. */
  async given(me: CurrentUser): Promise<TeamTaskView[]> {
    return this.views(await this.db.task.findMany({
      where: { kind: KIND, byUserId: me.id, OR: [{ dueOn: { gte: calendarDay(new Date()) } }, { status: { not: "done" } }] },
      orderBy: { createdAt: "desc" }, take: 200,
    }));
  }

  /** Mine (Sara / Marwa / Randa): open ones and what I finished today. */
  async mine(me: CurrentUser): Promise<TeamTaskView[]> {
    const today = dayStart(localDate(new Date()));
    return this.views(await this.db.task.findMany({
      where: { kind: KIND, toUserId: me.id, OR: [{ status: { not: "done" } }, { doneAt: { gte: today } }] },
      orderBy: { createdAt: "desc" }, take: 200,
    }));
  }

  async give(me: CurrentUser, input: TeamTaskInput): Promise<TeamTaskView & { kpi: TaskKpiEffect }> {
    const to = (await this.reports(me)).find((p) => p.userId === input.toUserId);
    if (!to) throw new BadRequestException("المهمة لحد من فريقك بس");
    if (input.unitId && !(await this.db.unit.count({ where: { id: input.unitId, archivedAt: null } }))) throw new BadRequestException("الوحدة مش موجودة");
    const now = new Date();
    const task = await this.db.$transaction(async (tx) => {
      // counted inside the transaction, with the person's row locked, so two at once can't pass 30
      await tx.$queryRaw`SELECT id FROM access."User" WHERE id = ${to.userId} FOR UPDATE`;
      const today = await tx.task.count({ where: { kind: KIND, toUserId: to.userId, dueOn: calendarDay(now) } });
      if (!teamTaskRoom(today)) throw new BadRequestException(`${to.name} عندها ${TEAM_TASKS_PER_DAY} مهمة النهارده (الحد الأقصى)`);
      const countsInKpi = input.countsInKpi ?? false; // 4.15: Skip unless «أيوه»
      const t = await tx.task.create({ data: { kind: KIND, title: input.title, unitId: input.unitId ?? null, byUserId: me.id, toUserId: to.userId, dueOn: calendarDay(now), countsInKpi } });
      await this.audit.record({ module: "inventory", entity: "Task", entityId: t.id, action: "create", userId: me.id, after: { to: to.name, title: t.title, unitId: t.unitId, countsInKpi } }, tx);
      return { t, kpi: countsInKpi ? await this.kpis.countTask(tx, to.userId, me.id, me.id) : null };
    });
    await this.notifications.notify({ event: "inventory.team_task", userIds: [to.userId], link: "/", text: `مهمة من ${me.name}: ${input.title}` });
    return { ...(await this.views([task.t]))[0]!, kpi: task.kpi };
  }

  /** Only the person it's for marks it done. */
  async done(me: CurrentUser, id: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const t = await tx.task.findFirst({ where: { id, kind: KIND, toUserId: me.id } });
      if (!t) throw new NotFoundException("المهمة مش موجودة");
      if (t.status === "done") return;
      await tx.task.update({ where: { id }, data: { status: "done", doneAt: new Date() } });
      await this.audit.record({ module: "inventory", entity: "Task", entityId: id, action: "done", userId: me.id, before: { status: t.status }, after: { status: "done" } }, tx);
    });
  }

  /** Manar's team: the active people who report to her (M-03 1.2). */
  private async reports(me: CurrentUser) {
    if (!me.employeeId) return [];
    return this.db.employee.findMany({
      where: { managerId: me.employeeId, user: { status: { not: "DISABLED" } } }, select: { userId: true, name: true }, orderBy: { name: "asc" },
    });
  }

  private async givenToday(userIds: string[], now: Date) {
    const rows = await this.db.task.groupBy({ by: ["toUserId"], where: { kind: KIND, toUserId: { in: userIds }, dueOn: calendarDay(now) }, _count: true });
    return new Map(rows.map((r) => [r.toUserId, r._count]));
  }

  private async views(tasks: TaskRow[]): Promise<TeamTaskView[]> {
    const userIds = [...new Set(tasks.flatMap((t) => [t.toUserId, t.byUserId]).filter((x): x is string => !!x))];
    const unitIds = [...new Set(tasks.map((t) => t.unitId).filter((x): x is string => !!x))];
    const [people, units] = await Promise.all([
      this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } }),
      this.db.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, code: true } }),
    ]);
    const name = (id: string) => ({ id, name: people.find((p) => p.userId === id)?.name ?? "" });
    return tasks.map((t) => ({
      id: t.id, title: t.title ?? "", unit: units.find((u) => u.id === t.unitId) ?? null, to: name(t.toUserId), by: name(t.byUserId ?? ""),
      dueOn: t.dueOn.toISOString().slice(0, 10), status: t.status === "done" ? "done" : "todo", doneAt: t.doneAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(),
    }));
  }
}
