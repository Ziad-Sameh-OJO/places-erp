/**
 * M-04 · tasks between departments (the demo's «المهام» board): the kinds, who a kind goes to, the stages
 * (M-04 3.3: To Do → In Progress → Done, with Undo) and which move each person may make.
 * A Retouch has one more stage: the designer uploads the photos, and only Manar's approval makes it Done (M-04 2.2).
 */
import { localDate } from "./business-time.ts";

export interface TaskKind {
  readonly key: string;
  readonly label: string;
  /** the roles a task of this kind can be given to (M-04 1.2) */
  readonly assigneeRoles: readonly string[];
  /** about one unit: its data reaches the assignee with the task (M-04 2.1 step 4) */
  readonly withUnit: boolean;
  /** the permission that lets someone give this kind; null = only the system creates it (the month job, 2.17) */
  readonly createdWith: { readonly module: "inventory" | "marketing"; readonly action: "edit" | "create" } | null;
}

/** The demo's kinds (tasks.js `KIND`). Marketing tasks carry their type from «أنواع تاسكات التسويق» (Website leasing, Market survey…, M-04 3.1). */
export const TASK_KINDS: readonly TaskKind[] = [
  // M-04 2.1 step 4 · 3.1: «منار / رندا (تصوير)»
  { key: "photo", label: "تصوير", assigneeRoles: ["photographer"], withUnit: true, createdWith: { module: "inventory", action: "edit" } },
  // M-04 1.2: the photographer also gets the Retouch; 2.3: never by AI, always a human designer
  { key: "retouch", label: "Retouch", assigneeRoles: ["designer", "photographer"], withUnit: true, createdWith: { module: "inventory", action: "edit" } },
  // M-03 2.4: a unit untouched for a month → a follow-up with the owner (created by the job, 2.17)
  { key: "followup", label: "متابعة مع المالك", assigneeRoles: ["inventory", "resale"], withUnit: true, createdWith: null },
  // the demo's rent → resale hand-off to Randa
  { key: "toResale", label: "ابديت للبيع", assigneeRoles: ["resale"], withUnit: true, createdWith: { module: "inventory", action: "edit" } },
  // M-03 3.1 · 2.16: Manar's daily tasks to her team, given from the inventory («مهمة للفريق», at most 30 a day each)
  { key: "team", label: "مهمة من منار", assigneeRoles: ["resale", "inventory_staff"], withUnit: false, createdWith: null },
  // M-04 3.1: «مدير التسويق (الباقي)»
  { key: "marketing", label: "تسويق", assigneeRoles: ["marketing", "photographer", "designer"], withUnit: false, createdWith: { module: "marketing", action: "create" } },
];
export const taskKind = (key: string): TaskKind | undefined => TASK_KINDS.find((k) => k.key === key);

/** M-04 3.3, plus the Retouch's «اترفعت · مستنية موافقة منار» (2.2). */
export const TASK_STATUSES = ["todo", "progress", "uploaded", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: "To Do", progress: "In Progress", uploaded: "اترفعت · مستنية موافقة منار", done: "Done" };

/**
 * Who is acting on the task: its assignee, someone who manages it (gave it, or sees the whole department's tasks),
 * and whether they approve Retouch (Manar: «tasks: approve»).
 */
export interface TaskActor { readonly assignee: boolean; readonly manager: boolean; readonly approver: boolean }

/** A move from one stage to another and what it means: Undo, a Retouch sent back (KPI: accepted first time). */
export type TaskMove = { ok: true; undo: boolean; returned: boolean } | { ok: false; reason: string };

const refuse = (reason: string): TaskMove => ({ ok: false, reason });

/** Whether `actor` may move a task of `kind` from `from` to `to` (M-04 2.1 steps 5, 3.3, 7.1). */
export function taskMove(kind: string, from: TaskStatus, to: TaskStatus, actor: TaskActor): TaskMove {
  if (from === to) return refuse("المهمة في الحالة دي أصلاً");
  const retouch = kind === "retouch";
  const works = actor.assignee || actor.manager;
  if (from === "uploaded") {
    // M-04 2.2: «متبقاش Done غير لما منار توافق عليها. لو موافقتش، ترجع للمصمم»
    if (to === "done" || to === "todo") return actor.approver ? { ok: true, undo: false, returned: to === "todo" } : refuse("الـ Retouch بيتوافق عليه أو يرجع من منار بس");
    return refuse("الـ Retouch اللي اترفع يا يتوافق عليه يا يرجع");
  }
  if (to === "uploaded") {
    if (!retouch) return refuse("العمود ده لمهام الـ Retouch بس");
    return works ? { ok: true, undo: false, returned: false } : refuse("المهمة دي مش بتاعتك");
  }
  if (from === "done") {
    if (to !== "todo") return refuse("المهمة خلصت · Undo يرجّعها للمهام");
    if (retouch) return refuse("الـ Retouch اتوافق عليه من منار · مفيش Undo");
    // M-04 7.1: «مصوّر داس Done بالغلط · يقدر يدوس Undo والوحدة ترجع للوحة»
    return works ? { ok: true, undo: true, returned: false } : refuse("المهمة دي مش بتاعتك");
  }
  if (to === "done" && retouch) return refuse("الـ Retouch مبيبقاش Done غير بموافقة منار · ارفع الصور على صفحة الوحدة الأول");
  return works ? { ok: true, undo: false, returned: false } : refuse("المهمة دي مش بتاعتك");
}

/** The stages `actor` may move the task to from where it is now (the board's buttons; the server checks again). */
export const taskMovesFor = (kind: string, from: TaskStatus, actor: TaskActor): TaskStatus[] =>
  TASK_STATUSES.filter((to) => taskMove(kind, from, to, actor).ok);

/** M-04 2.4: «المهام اليومية لازم تخلص في يومها» — late once its day (Cairo) has passed and it isn't Done. */
export const isTaskLate = (t: { status: string; dueOn: string }, now: Date): boolean => t.status !== "done" && t.dueOn < localDate(now);

/**
 * M-03 2.4 · (21) · 2.17: a unit whose «last update» is over a month old gets a follow-up with its owner, unless one is
 * still open. Who calls the owner (2.1 step 10 «منار / رندا: ابديت دوري مع المالك»; the demo's split): Randa (resale)
 * for a Resale unit, Manar (inventory) for the rest.
 */
export const followupRole = (unitType: string): string => (unitType === "Resale" ? "resale" : "inventory");
export const needsFollowup = (u: { stale: boolean; openFollowup: boolean }): boolean => u.stale && !u.openFollowup;
