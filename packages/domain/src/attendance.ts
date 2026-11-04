/**
 * M-05 · attendance rules. Work starts 11:00 for everyone. Default tiers (HR can set per-person tiers, Q33):
 * up to 11:16 on time · 11:17–11:29 quarter day · 11:30–11:59 half day · 12:00+ full day.
 * Weekly Delay counts every minute after 11:16, whatever the reason (Excuse, Visit…), without exception.
 */
export interface DeductionTiers {
  /** check-in minute (after 11:00) from which each deduction starts */
  readonly quarterFrom: number;
  readonly halfFrom: number;
  readonly dayFrom: number;
}
export const DEFAULT_TIERS: DeductionTiers = { quarterFrom: 17, halfFrom: 30, dayFrom: 60 };
export const GRACE_MINUTES = 16;

export type DayKind =
  | { kind: "checkin"; minutesAfterStart: number }
  | { kind: "excuse"; minutesAfterStart: number; excuseNumberThisMonth: number }
  | { kind: "visit"; done: boolean }
  | { kind: "outside-approved" }
  | { kind: "forgot-fingerprint"; confirmedByHr: boolean }
  | { kind: "absent-without-permission" }
  | { kind: "special-schedule" };

export interface DayResult {
  /** fraction of a day deducted: 0, 0.25, 0.5 or 1 */
  readonly deduction: 0 | 0.25 | 0.5 | 1;
  /** minutes counted in Weekly Delay */
  readonly lateMinutes: number;
  readonly label: string;
  /** the 5th Excuse in a month is refused and raises an alert to management and HR (Q31) */
  readonly alertManagement: boolean;
}

const lateMinutes = (m: number): number => Math.max(0, m - GRACE_MINUTES);

function byTiers(m: number, t: DeductionTiers): DayResult["deduction"] {
  if (m >= t.dayFrom) return 1;
  if (m >= t.halfFrom) return 0.5;
  if (m >= t.quarterFrom) return 0.25;
  return 0;
}

export function attendanceDay(day: DayKind, tiers: DeductionTiers = DEFAULT_TIERS): DayResult {
  switch (day.kind) {
    case "special-schedule": return { deduction: 0, lateMinutes: 0, label: "مواعيد خاصة", alertManagement: false };
    case "absent-without-permission": return { deduction: 1, lateMinutes: 0, label: "غياب من غير إذن", alertManagement: false };
    case "outside-approved": return { deduction: 0, lateMinutes: 0, label: "شغل من بره (معتمد)", alertManagement: false };
    case "forgot-fingerprint": return { deduction: day.confirmedByHr ? 1 : 0, lateMinutes: 0, label: "نسي البصمة", alertManagement: false };
    // Q29: a Visit never gets a deduction; one marked not done is flagged to HR
    case "visit": return { deduction: 0, lateMinutes: 0, label: day.done ? "Visit" : "Visit · معملهاش", alertManagement: false };
    case "excuse": {
      const n = day.excuseNumberThisMonth;
      if (n >= 5) return { deduction: byTiers(day.minutesAfterStart, tiers), lateMinutes: lateMinutes(day.minutesAfterStart), label: `Excuse #${n} اترفض`, alertManagement: true };
      return { deduction: n >= 3 ? 0.5 : 0, lateMinutes: lateMinutes(day.minutesAfterStart), label: `Excuse #${n}`, alertManagement: false };
    }
    case "checkin": {
      const d = byTiers(day.minutesAfterStart, tiers);
      return { deduction: d, lateMinutes: lateMinutes(day.minutesAfterStart), label: d ? "متأخر" : "في الميعاد", alertManagement: false };
    }
  }
}

/** One day's pay: salary ÷ 26 working days. */
export const dayRate = (monthlySalary: number): number => monthlySalary / 26;

/**
 * Per-person tiers (M-05 3.1, Q33): HR picks the minute each deduction starts. Why they can't be saved, or null:
 * after the 16-minute grace, in order quarter < half < day, within the working day.
 */
export function tiersProblem(t: DeductionTiers): string | null {
  const ok = (n: number) => Number.isInteger(n) && n > GRACE_MINUTES && n <= 8 * 60;
  if (![t.quarterFrom, t.halfFrom, t.dayFrom].every(ok)) return `الشرايح بتبدأ بعد ${GRACE_MINUTES} دقيقة ولحد آخر اليوم`;
  if (!(t.quarterFrom < t.halfFrom && t.halfFrom < t.dayFrom)) return "الربع قبل النص، والنص قبل اليوم";
  return null;
}
