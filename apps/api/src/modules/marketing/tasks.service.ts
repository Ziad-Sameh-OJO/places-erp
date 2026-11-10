import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CreateTask, EditTask, MoveTask, TaskCreated, TaskFilters, TaskOptions, TaskRow, TaskSlaQuery, TaskSlaReport, TaskUnitOption, UnitPhotoView } from "@places/contracts";
import {
  TASK_KINDS, TASK_STATUS_LABEL, type TaskActor, type TaskSide, type TaskStatus, dayStart, isTaskLate, isTeamTask, localDate, photoDayWarning, retouchFolder, seesOwnerNumbers, taskKind, taskMove, taskMovesFor, taskSla, taskSlaReport,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryService } from "../inventory/inventory.service";
import { KpisService } from "../kpis/kpis.service";
import { UnitPhotosService } from "../inventory/unit-photos.service";
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
    private readonly unitPhotos: UnitPhotosService,
    private readonly settings: SettingsService,
    private readonly kpis: KpisService,
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
    const depts = await this.repo.departments();
    const where: Prisma.TaskWhereInput = {
      AND: [
        await this.scope(me),
        f.kind ? { kind: f.kind } : {},
        f.toUserId ? { toUserId: f.toUserId } : {},
        f.scope ? sideWhere(depts, f.scope) : {},
        // one unit's tasks (its drawer, 2.30) are few: all of them, the old Done ones too, as in the demo's tab
        f.unitId ? { unitId: f.unitId } : { OR: [{ status: { not: "done" } }, { doneAt: { gte: recent } }] },
      ],
    };
    const rows = await this.repo.list(where, BOARD_MAX);
    const names = await this.repo.names(rows.flatMap((t) => [t.toUserId, ...(t.byUserId ? [t.byUserId] : [])]));
    return rows.map((t) => this.row(me, t, names, depts, now));
  }

  async get(me: CurrentUser, id: string): Promise<TaskRow> {
    const t = await this.find(me, id);
    return this.row(me, t, await this.repo.names([t.toUserId, ...(t.byUserId ? [t.byUserId] : [])]), await this.repo.departments(), new Date());
  }

  /** M-12 (Bayoumi 1-2, Rahma 6): shoots in 72 h, Retouch in 48 h, Retouch accepted the first time — of a month's Done tasks in the scope. */
  async slaReport(me: CurrentUser, q: TaskSlaQuery, now = new Date()): Promise<TaskSlaReport> {
    const month = q.month ?? localDate(now).slice(0, 7);
    const [y, m] = month.split("-").map(Number) as [number, number];
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const done = await this.repo.doneBetween(await this.scope(me), dayStart(`${month}-01`), dayStart(`${next}-01`));
    return { month, ...taskSlaReport(done.map((t) => ({ ...t, unitEnteredAt: t.unit?.enteredAt ?? null }))) };
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
  async create(me: CurrentUser, input: CreateTask): Promise<TaskCreated> {
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
      unitId: kind.withUnit ? input.unitId! : null, title: kind.key === "marketing" ? input.title! : null,
      note: me.fields.fixed("tasks").has("note") ? null : input.note ?? null, // M-09: a note the person may not set starts empty
      countsInKpi: input.countsInKpi ?? false, // 4.15: Skip unless «أيوه»
    };
    const warning = kind.key === "photo" ? photoDayWarning(kind.key, await this.repo.openSameDay(kind.key, me.id, input.toUserId, data.dueOn)) : null;
    const created = await this.db.$transaction(async (tx) => {
      const t = await this.repo.create(tx, data);
      await this.audit.record({ module: "tasks", entity: "Task", entityId: t.id, action: "create", userId: me.id, after: { ...data, dueOn: input.dueOn } }, tx);
      return { ...t, kpi: data.countsInKpi ? await this.kpis.countTask(tx, input.toUserId, me.id, me.id) : null };
    });
    if (input.toUserId !== me.id) {
      await this.notifications.notify({ event: "task.new", text: `مهمة ${kind.label} جديدة: ${unitCode ?? input.title} من ${me.name}`, link: link(created.id), userIds: [input.toUserId] });
    }
    return { id: created.id, warning, kpi: created.kpi };
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
    await this.announce(me, t, input.status, m.returned);
    return this.get(me, id);
  }

  /**
   * Who else hears (M-04 2.1 steps 5 · 2.2, the demo's notices): uploaded Retouch → inventory (Manar approves);
   * approved Retouch → marketing; a shoot Done → inventory and marketing.
   */
  private async announce(me: CurrentUser, t: TaskRecord, to: TaskStatus, returned: boolean) {
    const unit = t.unit?.code ?? "";
    if (t.kind === "retouch" && to === "uploaded") {
      await this.notifications.notify({ event: "task.review", text: `${me.name} رفع صور الـ Retouch لـ ${unit} · محتاجة موافقتك`, link: link(t.id) });
    } else if (t.kind === "retouch" && to === "done" && !returned) {
      await this.notifications.notify({ event: "task.delivered", text: `الـ Retouch لـ ${unit} اتوافق عليه`, link: link(t.id), to: ["marketing"] });
    } else if (t.kind === "photo" && to === "done") {
      await this.notifications.notify({ event: "task.delivered", text: `${me.name} خلّص تصوير ${unit}`, link: link(t.id) });
    }
  }

  /** Reassign or move the day — whoever manages the task, while it isn't Done. */
  async edit(me: CurrentUser, id: string, input: EditTask): Promise<TaskRow> {
    const t = await this.find(me, id);
    if (!actor(me, t).manager) throw new ForbiddenException("اللي إدّى المهمة أو مدير القسم بس اللي يعدّلها");
    if (t.status === "done") throw new BadRequestException("المهمة خلصت · Undo الأول");
    if (input.toUserId && input.toUserId !== t.toUserId) await this.checkAssignee(t.kind, input.toUserId);
    const before = { toUserId: t.toUserId, dueOn: day(t.dueOn), note: t.note };
    // M-09: a note the person may not change keeps its stored value
    const after = { toUserId: input.toUserId ?? t.toUserId, dueOn: input.dueOn ?? day(t.dueOn), note: input.note === undefined || me.fields.fixed("tasks").has("note") ? t.note : input.note };
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

  /** 4.12: the unit's Pic & Info folder from its Retouch task — the designer has no inventory of his own to open it from. */
  async photos(me: CurrentUser, id: string): Promise<UnitPhotoView[]> {
    return this.unitPhotos.view((await this.folderOf(me, id, "open")).id);
  }

  async photosZip(me: CurrentUser, id: string) {
    return this.unitPhotos.zipOf(me, await this.folderOf(me, id, "open"));
  }

  /** 4.12: the designer's edited photos go into the unit's folder (audited there, and the PDF waits for Manar's confirm again). */
  async addPhotos(me: CurrentUser, id: string, fileIds: string[]): Promise<UnitPhotoView[]> {
    return this.unitPhotos.put(me, (await this.folderOf(me, id, "upload")).id, fileIds);
  }

  private async folderOf(me: CurrentUser, id: string, need: "open" | "upload"): Promise<{ id: string; code: string }> {
    const t = await this.find(me, id);
    if (!t.unit || !folder(me, t)[need]) {
      throw new ForbiddenException(need === "open" ? "صور الوحدة بتتفتح من مهمة الـ Retouch بس" : "اللي ماسك الـ Retouch بس اللي يرفع الصور، وقبل ما تتبعت لمنار");
    }
    return t.unit;
  }

  /** M-09 2.2 · 7.1: a leaver's unfinished tasks. */
  openCount(userId: string) {
    return this.db.task.count({ where: { toUserId: userId, status: { not: "done" } } });
  }

  /** M-09 2.2 · 7.1: a leaver's unfinished tasks go to `toUserId` inside the caller's transaction (the manager's approval). */
  async handOver(tx: Prisma.TransactionClient, fromUserId: string, toUserId: string): Promise<number> {
    return (await tx.task.updateMany({ where: { toUserId: fromUserId, status: { not: "done" } }, data: { toUserId } })).count;
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

  private row(me: CurrentUser, t: TaskRecord, names: Map<string, string>, depts: Map<string, string>, now: Date): TaskRow {
    const a = actor(me, t);
    const status = t.status as TaskStatus;
    const u = t.unit;
    const sla = taskSla({ kind: t.kind, status, createdAt: t.createdAt, doneAt: t.doneAt, returned: t.returned, unitEnteredAt: u?.enteredAt ?? null }, now);
    // the owner's number: the photographer of a shoot calls him (M-04 2.1 step 5); otherwise only who sees owner numbers (M-10 4.1)
    // M-09 field permissions on top of that: a hidden field's value never leaves the API (the screens leave it out too)
    const h = me.fields.hidden("tasks"), hide = <V,>(k: string, v: V, blank: V) => (h.has(k) ? blank : v);
    const ownerPhone = (t.kind === "photo" && t.toUserId === me.id) || seesOwnerNumbers(me.grants) ? hide("ownerPhone", u?.ownerPhone ?? null, null) : null;
    return {
      id: t.id, kind: t.kind, kindLabel: taskKind(t.kind)?.label ?? t.kind, title: t.title,
      unit: u && {
        id: u.id, code: u.code, project: u.project, area: hide("area", u.area, ""), floor: hide("floor", u.floor, null), building: hide("building", u.building, null),
        ownerName: hide("ownerName", u.ownerName, null), ownerPhone,
      },
      sla: sla && { due: sla.due.toISOString(), hoursLeft: sla.hoursLeft, met: sla.met },
      by: t.byUserId ? { id: t.byUserId, name: names.get(t.byUserId) ?? "—" } : null,
      to: { id: t.toUserId, name: names.get(t.toUserId) ?? "—" },
      dueOn: day(t.dueOn), status, returned: t.returned, note: hide("note", t.note, null), doneAt: t.doneAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(),
      late: isTaskLate({ status, dueOn: day(t.dueOn) }, now), countsInKpi: t.countsInKpi,
      side: isTeamTask(t.byUserId ? depts.get(t.byUserId) ?? "" : null, depts.get(t.toUserId) ?? "") ? "team" : "outside",
      can: {
        moves: me.grants.can("tasks", "edit") ? taskMovesFor(t.kind, status, a) : [], edit: me.grants.can("tasks", "edit") && a.manager && status !== "done",
        folder: folder(me, t),
      },
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

/** 4.12: the Retouch's folder (domain rule), adding only with «tasks: edit». */
function folder(me: CurrentUser, t: TaskRecord): { open: boolean; upload: boolean } {
  const f = retouchFolder(t.kind, t.status as TaskStatus, actor(me, t));
  return { open: f.open && !!t.unit, upload: f.upload && !!t.unit && me.grants.can("tasks", "edit") };
}

/**
 * 4.14 · the side as a query (domain isTeamTask): the team's = sender and assignee in one department, or no sender
 * (the system's); the rest goes outside. One OR branch per department: there are only a handful.
 */
function sideWhere(depts: Map<string, string>, side: TaskSide): Prisma.TaskWhereInput {
  const groups = new Map<string, string[]>();
  for (const [id, d] of depts) groups.set(d, [...(groups.get(d) ?? []), id]);
  const team: Prisma.TaskWhereInput = {
    OR: [{ byUserId: null }, ...[...groups.values()].map((ids) => ({ toUserId: { in: ids }, byUserId: { in: ids } }))],
  };
  return side === "team" ? team : { NOT: team };
}

const label = (t: Pick<TaskRecord, "kind" | "title" | "unit">) => `${taskKind(t.kind)?.label ?? t.kind} ${t.unit?.code ?? t.title ?? ""}`.trim();
/** A @db.Date column: the calendar day as stored (UTC midnight), not shifted to Cairo. */
const day = (d: Date) => d.toISOString().slice(0, 10);
const dayStartUtc = (d: string) => new Date(`${d}T00:00:00Z`);
