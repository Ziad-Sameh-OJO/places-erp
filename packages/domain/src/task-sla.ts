/**
 * M-04 3.1 · M-12 (Bayoumi's and Rahma's KPI cards): the photo shoot is due 72 hours after the unit was registered,
 * the Retouch 48 hours after it was given, and a Retouch counts «accepted the first time» when Manar never sent it back.
 * The KPIs say «72 ساعة» / «48 ساعة» with no working-hours wording (unlike the tickets' «24 ساعة عمل»), so it is
 * the plain clock.
 */
const HOUR_MS = 3_600_000;

/** M-12: «تصوير الوحدات الجديدة خلال 72 ساعة من تسجيلها» · «تسليم المواد متعدّلة خلال 48 ساعة» */
export const TASK_SLA_HOURS: Readonly<Record<string, number>> = { photo: 72, retouch: 48 };

export interface SlaTask {
  readonly kind: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly doneAt: Date | null;
  readonly returned: number;
  /** when the unit was registered (the photo shoot's clock starts there) */
  readonly unitEnteredAt: Date | null;
}

/** When the clock starts: the unit's registration for a shoot (M-12 «من تسجيل الوحدة»), the task itself otherwise. */
const slaStart = (t: SlaTask): Date => (t.kind === "photo" && t.unitEnteredAt ? t.unitEnteredAt : t.createdAt);

/** The task's SLA deadline, or null for a kind without one. */
export function taskSlaDue(t: SlaTask): Date | null {
  const hours = TASK_SLA_HOURS[t.kind];
  return hours === undefined ? null : new Date(slaStart(t).getTime() + hours * HOUR_MS);
}

export type TaskSlaState = { due: Date; met: boolean | null; hoursLeft: number };

/**
 * Where the task stands against its SLA at `now`: met / missed once Done (Retouch Done = approved), else the hours
 * left (negative = late). null when the kind has no SLA.
 */
export function taskSla(t: SlaTask, now: Date): TaskSlaState | null {
  const due = taskSlaDue(t);
  if (!due) return null;
  const end = t.status === "done" && t.doneAt ? t.doneAt : null;
  return { due, met: end ? end.getTime() <= due.getTime() : null, hoursLeft: Math.floor((due.getTime() - (end ?? now).getTime()) / HOUR_MS) };
}

export interface TaskSlaRate { total: number; met: number; percent: number | null }
const rate = (met: number, total: number): TaskSlaRate => ({ total, met, percent: total ? Math.round((met / total) * 1000) / 10 : null });

/**
 * The KPI lines from the tasks Done in a period: shoots within 72 h, Retouch within 48 h, Retouch accepted the first
 * time (M-12: ≥90%, ≥90%, ≥85%). Only Done tasks count: an open one hasn't been delivered yet.
 */
export function taskSlaReport(tasks: readonly SlaTask[]): { photo: TaskSlaRate; retouch: TaskSlaRate; firstTime: TaskSlaRate } {
  const done = (kind: string) => tasks.filter((t) => t.kind === kind && t.status === "done" && t.doneAt);
  const inTime = (list: SlaTask[]) => list.filter((t) => taskSla(t, t.doneAt!)?.met).length;
  const photos = done("photo"), retouches = done("retouch");
  return {
    photo: rate(inTime(photos), photos.length),
    retouch: rate(inTime(retouches), retouches.length),
    firstTime: rate(retouches.filter((t) => t.returned === 0).length, retouches.length),
  };
}
