import { z } from "zod";
import { TASK_SIDES, TASK_STATUSES, type TaskSide, taskKind } from "@places/domain";
import { CalendarDay, Id } from "./common.ts";

/** M-04 · the board's filters: by kind and by assignee (4.2); by unit for the unit drawer's «المهام» tab (2.30). */
export const TaskFilters = z.object({
  kind: z.string().max(20).optional(),
  toUserId: Id.optional(),
  unitId: Id.optional(),
  /** 4.14: «مهام الفريق» (same department, and the system's) or «مهام لناس خارجية» */
  scope: z.enum(TASK_SIDES).optional(),
});
export type TaskFilters = z.infer<typeof TaskFilters>;

export const CreateTask = z.object({
  kind: z.string().refine((k) => !!taskKind(k)?.createdWith, "نوع المهمة مش موجود"),
  toUserId: Id,
  dueOn: CalendarDay,
  unitId: Id.optional(), // photo / Retouch / rent → resale: the unit; its data reaches the assignee with the task
  title: z.string().trim().min(1).max(120).optional(), // a marketing task: its type from «أنواع تاسكات التسويق»
  note: z.string().trim().max(1000, "الملاحظات طويلة · 1000 حرف بالكتير").optional(),
});
export type CreateTask = z.infer<typeof CreateTask>;

/** Reassign or change the day (whoever manages the task). */
export const EditTask = z.object({
  toUserId: Id.optional(),
  dueOn: CalendarDay.optional(),
  note: z.string().trim().max(1000, "الملاحظات طويلة · 1000 حرف بالكتير").nullable().optional(),
}).refine((e) => e.toUserId !== undefined || e.dueOn !== undefined || e.note !== undefined, "مفيش تعديل");
export type EditTask = z.infer<typeof EditTask>;

export const MoveTask = z.object({ status: z.enum(TASK_STATUSES) });
export type MoveTask = z.infer<typeof MoveTask>;

export interface TaskUnit { id: string; code: string; project: string; area: string; floor: string | null; building: string | null; ownerName: string | null; ownerPhone: string | null }

export interface TaskRow {
  id: string;
  kind: string;
  kindLabel: string;
  title: string | null;
  unit: TaskUnit | null;
  /** null = the system */
  by: { id: string; name: string } | null;
  to: { id: string; name: string };
  dueOn: string;
  status: (typeof TASK_STATUSES)[number];
  returned: number;
  note: string | null;
  doneAt: string | null;
  createdAt: string;
  late: boolean;
  /** 4.14: the board's side, by the sender's and the assignee's department (domain isTeamTask) */
  side: TaskSide;
  /** M-12: a shoot 72 h from the unit's registration, a Retouch 48 h from being given; null for other kinds */
  sla: { due: string; hoursLeft: number; met: boolean | null } | null;
  /** the stages the caller may move it to, and whether they may reassign it (the server checks again) */
  can: {
    moves: (typeof TASK_STATUSES)[number][]; edit: boolean;
    /** 4.12: a Retouch opens the unit's Pic & Info folder; its designer adds the edited photos while working it */
    folder: { open: boolean; upload: boolean };
  };
}

export interface TaskOptions {
  /** the kinds the caller may give, each with the people it can go to */
  kinds: Array<{ key: string; label: string; assignees: Array<{ id: string; name: string }> }>;
  /** «أنواع تاسكات التسويق» (M-13), the active ones */
  marketingTypes: string[];
}

/** The new-task form's unit search (4.2). */
export const TaskUnitQuery = z.object({ q: z.string().trim().max(60).optional() });
export type TaskUnitQuery = z.infer<typeof TaskUnitQuery>;
export interface TaskUnitOption { id: string; code: string; project: string; space: number }

/** The SLA report (4.3 · M-12): the tasks Done in a month (Cairo). */
export const TaskSlaQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر لازم يبقى YYYY-MM").optional() });
export type TaskSlaQuery = z.infer<typeof TaskSlaQuery>;
export interface TaskSlaRate { total: number; met: number; percent: number | null }
export interface TaskSlaReport { month: string; photo: TaskSlaRate; retouch: TaskSlaRate; firstTime: TaskSlaRate }
