import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CreateTask, EditTask, MoveTask, TaskFilters, TaskOptions, TaskRow, TaskUnitOption } from "@places/contracts";
import { TASK_KINDS, TASK_STATUS_LABEL, type TaskActor, type TaskStatus, isTaskLate, taskKind, taskMove, taskMovesFor } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryService } from "../inventory/inventory.service";
import { SettingsService } from "../settings/settings.service";
import { type TaskRecord, TasksRepository } from "./tasks.repository";

/** Out of scope or gone: the same answer, so it doesn't tell whether the task exists. */
const NO_TASK = "المهمة دي مش موجودة أو مش من حقك تشوفها";
const CHANGED = "المهمة اتغيّرت دلوقتي · افتحها تاني";
/** The board keeps a month of Done cards, so a Done pressed by mistake can still be undone (M-04 7.1). */
const BOARD_DONE_DAYS = 30;
const BOARD_MAX = 500;
const link = (id: string) => `/tasks?id=${id}`;

/** M-04 · tasks between departments: give, list, move (with Undo and Manar's Retouch approval), reassign. */
@Injectable()
export class TasksService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: TasksRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly inventory: InventoryService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * M-04 4.1 by data scope: photographers and designers see their own tasks; Rahma (Marketing, dept) every task of
   * her department's people, so the photographer's tasks from Manar and Randa too; the Super Admin all. Whoever
   * approves Retouch (Manar) also sees the uploaded ones waiting for her.
   */
  private async scope(me: CurrentUser): Promise<Prisma.TaskWhereInput> {
    if (me.grants.scope === "all") return {};
    const people = me.grants.scope === "dept" && me.department ? await this.repo.departmentPeople(me.department)
      : me.grants.scope === "team" ? await this.repo.accountsOf(me.teamIds) : [];
    const ids = [...new Set([me.id, ...people])];
    return {
      OR: [
        { toUserId: { in: ids } }, { byUserId: { in: ids } },
        ...(me.grants.can("tasks", "approve") ? [{ kind: "retouch", status: "uploaded" }] : []),
      ],
    };
  }

  async list(me: CurrentUser, f: TaskFilters, now = new Date()): Promise<TaskRow[]> {
    const recent = new Date(now.getTime() - BOARD_DONE_DAYS * 86_400_000);
    const where: Prisma.TaskWhereInput = {
      AND: [
        await this.scope(me),
        f.kind ? { kind: f.kind } : {},
        f.toUserId ? { toUserId: f.toUserId } : {},
        { OR: [{ status: { not: "done" } }, { doneAt: { gte: recent } }] },
      ],
    };
    const rows = await this.repo.list(where, BOARD_MAX);
    const names = await this.repo.names(rows.flatMap((t) => [t.toUserId, ...(t.byUserId ? [t.byUserId] : [])]));
    return rows.map((t) => this.row(me, t, names, now));
  }

  async get(me: CurrentUser, id: string): Promise<TaskRow> {
    const t = await this.find(me, id);
    return this.row(me, t, await this.repo.names([t.toUserId, ...(t.byUserId ? [t.byUserId] : [])]), new Date());
  }

  /** The kinds the caller may give (M-04 3.1: Manar / Randa the photo shoots, the marketing manager the rest), with who each goes to. */
  async options(me: CurrentUser): Promise<TaskOptions> {
    const kinds = TASK_KINDS.filter((k) => mayGive(me, k.key));
    const settings = await this.settings.all();
    return {
      kinds: await Promise.all(kinds.map(async (k) => ({ key: k.key, label: k.label, assignees: await this.repo.withRoles(k.assigneeRoles) }))),
      marketingTypes: settings.mkTaskTypes.filter((t) => t.active).map((t) => t.value),
    };
  }

  /** The units a task can be about (the new-task form), drafts too: a new unit is shot before its PDF is confirmed. */
  units(q?: string): Promise<TaskUnitOption[]> {
    return this.inventory.forTasks(q);
  }

  /** M-04 2.1 step 4: give a task; the assignee is told, with the unit's data. */
  async create(me: CurrentUser, input: CreateTask): Promise<{ id: string }> {
    const kind = taskKind(input.kind)!; // the contract refused unknown and system-only kinds
    if (!mayGive(me, kind.key)) throw new ForbiddenException(`مش من حقك تدّي مهمة ${kind.label}`);
    await this.checkAssignee(kind.key, input.toUserId);
    let unitCode: string | null = null;
    if (kind.withUnit) {
      if (!input.unitId) throw new BadRequestException("اختار الوحدة");
      unitCode = (await this.inventory.codes([input.unitId]))[0]?.code ?? null;
      if (!unitCode) throw new BadRequestException("الوحدة مش موجودة");
    }
    if (kind.key === "marketing") {
      const types = (await this.settings.all()).mkTaskTypes.filter((t) => t.active).map((t) => t.value);
      if (!input.title || !types.includes(input.title)) throw new BadRequestException("اختار المهمة من «أنواع تاسكات التسويق»");
    }
    const data = {
      kind: kind.key, toUserId: input.toUserId, byUserId: me.id, dueOn: dayStartUtc(input.dueOn),
      unitId: kind.withUnit ? input.unitId! : null, title: kind.key === "marketing" ? input.title! : null, note: input.note ?? null,
    };
    const created = await this.db.$transaction(async (tx) => {
      const t = await this.repo.create(tx, data);
      await this.audit.record({ module: "tasks", entity: "Task", entityId: t.id, action: "create", userId: me.id, after: { ...data, dueOn: input.dueOn } }, tx);
      return t;
    });
    if (input.toUserId !== me.id) {
      await this.notifications.notify({ event: "task.new", text: `مهمة ${kind.label} جديدة: ${unitCode ?? input.title} من ${me.name}`, link: link(created.id), userIds: [input.toUserId] });
    }
    return created;
  }

  /** M-04 3.3: To Do → In Progress → Done, Undo (7.1), and the Retouch's upload → Manar approves or sends it back (2.2). */
  async move(me: CurrentUser, id: string, input: MoveTask): Promise<TaskRow> {
    const t = await this.find(me, id);
    const from = t.status as TaskStatus;
    const m = taskMove(t.kind, from, input.status, actor(me, t));
    if (!m.ok) throw new BadRequestException(m.reason);
    const data: Prisma.TaskUncheckedUpdateInput = {
      status: input.status,
      doneAt: input.status === "done" ? new Date() : null,
      ...(m.returned ? { returned: { increment: 1 } } : {}),
    };
    await this.db.$transaction(async (tx) => {
      if ((await this.repo.update(tx, t.id, t.status, data)).count === 0) throw new ConflictException(CHANGED);
      await this.audit.record({ module: "tasks", entity: "Task", entityId: t.id, action: m.undo ? "undo" : m.returned ? "return" : "status", userId: me.id, before: { status: from }, after: { status: input.status } }, tx);
    });
    const what = m.undo ? "رجّعها للمهام (Undo)" : m.returned ? "رجّعها للتعديل" : `بقت ${TASK_STATUS_LABEL[input.status]}`;
    await this.tell(me, t, `${me.name}: مهمة ${label(t)} ${what}`);
    return this.get(me, id);
  }

  /** Reassign or move the day — whoever manages the task, while it isn't Done. */
  async edit(me: CurrentUser, id: string, input: EditTask): Promise<TaskRow> {
    const t = await this.find(me, id);
    if (!actor(me, t).manager) throw new ForbiddenException("اللي إدّى المهمة أو مدير القسم بس اللي يعدّلها");
    if (t.status === "done") throw new BadRequestException("المهمة خلصت · Undo الأول");
    if (input.toUserId && input.toUserId !== t.toUserId) await this.checkAssignee(t.kind, input.toUserId);
    const before = { toUserId: t.toUserId, dueOn: day(t.dueOn), note: t.note };
    const after = { toUserId: input.toUserId ?? t.toUserId, dueOn: input.dueOn ?? day(t.dueOn), note: input.note === undefined ? t.note : input.note };
    await this.db.$transaction(async (tx) => {
      const r = await this.repo.update(tx, t.id, t.status, { toUserId: after.toUserId, dueOn: dayStartUtc(after.dueOn), note: after.note });
      if (r.count === 0) throw new ConflictException(CHANGED);
      await this.audit.record({ module: "tasks", entity: "Task", entityId: t.id, action: after.toUserId !== before.toUserId ? "reassign" : "update", userId: me.id, before, after }, tx);
    });
    if (after.toUserId !== before.toUserId) {
      await this.notifications.notify({ event: "task.new", text: `مهمة ${label(t)} اتحوّلت ليك من ${me.name}`, link: link(t.id), userIds: [after.toUserId] });
    }
    await this.tell(me, { ...t, toUserId: before.toUserId }, `${me.name} عدّل مهمة ${label(t)}`);
    return this.get(me, id);
  }

  private async find(me: CurrentUser, id: string): Promise<TaskRecord> {
    const t = await this.repo.find(await this.scope(me), id);
    if (!t) throw new NotFoundException(NO_TASK);
    return t;
  }

  /** The assignee must be an active account of a role this kind goes to (M-04 1.2). */
  private async checkAssignee(kind: string, userId: string) {
    const roles = taskKind(kind)?.assigneeRoles ?? [];
    if (!(await this.repo.withRoles(roles)).some((u) => u.id === userId)) throw new BadRequestException("المسؤول ده مينفعش ياخد المهمة دي");
  }

  /** The other side hears of a change: the assignee, and whoever gave it — never the one who made it. */
  private async tell(me: CurrentUser, t: Pick<TaskRecord, "id" | "toUserId" | "byUserId">, text: string) {
    const userIds = [t.toUserId, t.byUserId].filter((u): u is string => !!u && u !== me.id);
    if (userIds.length) await this.notifications.notify({ event: "task.changed", text, link: link(t.id), userIds: [...new Set(userIds)] });
  }

  private row(me: CurrentUser, t: TaskRecord, names: Map<string, string>, now: Date): TaskRow {
    const a = actor(me, t);
    const status = t.status as TaskStatus;
    return {
      id: t.id, kind: t.kind, kindLabel: taskKind(t.kind)?.label ?? t.kind, title: t.title, unit: t.unit,
      by: t.byUserId ? { id: t.byUserId, name: names.get(t.byUserId) ?? "—" } : null,
      to: { id: t.toUserId, name: names.get(t.toUserId) ?? "—" },
      dueOn: day(t.dueOn), status, returned: t.returned, note: t.note, doneAt: t.doneAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(),
      late: isTaskLate({ status, dueOn: day(t.dueOn) }, now),
      can: { moves: me.grants.can("tasks", "edit") ? taskMovesFor(t.kind, status, a) : [], edit: me.grants.can("tasks", "edit") && a.manager && status !== "done" },
    };
  }
}

/** The kind's own permission on top of «tasks: create»: photo shoots need inventory editing, marketing tasks marketing (M-04 3.1). */
function mayGive(me: CurrentUser, kind: string): boolean {
  const by = taskKind(kind)?.createdWith;
  return !!by && me.grants.can("tasks", "create") && me.grants.can(by.module, by.action);
}

/** The assignee works it; whoever gave it, or sees the whole department's tasks, manages it; «tasks: approve» approves Retouch. */
function actor(me: CurrentUser, t: Pick<TaskRecord, "toUserId" | "byUserId">): TaskActor {
  return {
    assignee: t.toUserId === me.id,
    manager: t.byUserId === me.id || me.grants.scope === "dept" || me.grants.scope === "all",
    approver: me.grants.can("tasks", "approve"),
  };
}

const label = (t: Pick<TaskRecord, "kind" | "title" | "unit">) => `${taskKind(t.kind)?.label ?? t.kind} ${t.unit?.code ?? t.title ?? ""}`.trim();
/** A @db.Date column: the calendar day as stored (UTC midnight), not shifted to Cairo. */
const day = (d: Date) => d.toISOString().slice(0, 10);
const dayStartUtc = (d: string) => new Date(`${d}T00:00:00Z`);
