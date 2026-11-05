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

/* ---- the fingerprint sheet and the day (7.2 · 7.12) ---- */
/** Work starts 11:00 for everyone (M-05 2.1). */
export const WORK_START = "11:00";
/** Minutes after the start for a check-in «HH:MM» (negative = early). */
export function minutesAfterStart(checkIn: string, start = WORK_START): number {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return m(checkIn) - m(start);
}
/** «11:5» / «11.05» / «1105» → «11:05», or null when it isn't a time. */
export function normTime(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().replace(".", ":");
  const x = /^(\d{1,2}):?(\d{2})(?::\d{2})?$/.exec(s);
  if (!x) return null;
  const h = Number(x[1]), mi = Number(x[2]);
  return h < 24 && mi < 60 ? `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` : null;
}
/** A name from the device or a sheet, compared loosely: case, spaces, Arabic letter variants (أ/إ/آ → ا, ة → ه, ى → ي). */
export const normName = (s: string): string =>
  s.trim().toLowerCase().replace(/[ً-ْ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ");

export interface FingerprintDayInput {
  checkIn: string | null;
  partTime: boolean;
  /** HR decides if a part-timer has deductions (M-05 3.1) */
  partTimeDeductions: boolean;
  tiers: DeductionTiers | null;
  /** a person with fixed hours of their own (e.g. the CFO on Mon & Thu): no tiers against 11:00 */
  specialSchedule: boolean;
}
/**
 * One fingerprint day: the tiers against 11:00 (per-person tiers if HR set them); a part-timer without deductions
 * and a special schedule get none; Weekly Delay still counts every minute after 11:16 (M-05 3.2).
 */
export function fingerprintDay(i: FingerprintDayInput): DayResult {
  if (i.specialSchedule) return attendanceDay({ kind: "special-schedule" });
  const r = attendanceDay({ kind: "checkin", minutesAfterStart: minutesAfterStart(i.checkIn ?? WORK_START) }, i.tiers ?? DEFAULT_TIERS);
  if (i.partTime && !i.partTimeDeductions) return { ...r, deduction: 0, label: "Part-time" };
  return r;
}

/** The deduction in money: a day = salary ÷ 26 (piasters, rounded). */
export const deductionAmount = (salaryPiasters: number, fraction: number): number => Math.round((salaryPiasters / 26) * fraction);

/**
 * The month's line on the payroll sheet (M-05 (32) · 6.2 · 7.9): attendance days (Excuses already in them) plus approved
 * penalty days, each at salary ÷ 26, rounded once on the total (the demo's «أيام الخصم × يومية»). Never above the salary.
 * The KPI bonus / deduction (11.6) is added here when 11.x lands.
 */
export function monthDeduction(i: { salary: number; attendanceDays: number; penaltyDays: number }): { days: number; amount: number } {
  const days = i.attendanceDays + i.penaltyDays;
  return { days, amount: Math.min(i.salary, deductionAmount(i.salary, days)) };
}

/* ---- penalties (7.7) and the 1-to-1 (7.8) ---- */
/** A penalty's deduction in days: none, a quarter, a half, or whole days up to 3 (M-05 3.1). */
export const penaltyDaysOk = (d: number): boolean => d >= 0 && d <= 3 && Number.isInteger(d * 4);
/** A penalty reaches the deductions (and blocks «الموظف المثالي») only once HR approved it. */
export const penaltyCounts = (status: string): boolean => status === "approved";
/** The 1-to-1 is monthly (M-05): the next one is due in the month after the last (25/10 → November). */
export function oneOnOneDue(lastHeld: string | null, today: string): "due" | "done" {
  if (!lastHeld) return "due";
  return lastHeld.slice(0, 7) >= today.slice(0, 7) ? "done" : "due";
}
/** «حل الـ HR» rings on its day, once, until it's done. */
export const actionAlarm = (due: string | null, today: string, done: boolean, alarmed: boolean): boolean => !!due && !done && !alarmed && due <= today;

/* ---- the Excuse (7.4) ---- */
/** This request's number in the month: the ones not rejected before it + 1 (Q31). */
export const excuseNumber = (earlierThisMonth: number): number => earlierThisMonth + 1;
/** The 5th Excuse in a month is refused at once and management hears of it (Q31: «الخامس رفد»). */
export const excuseRefused = (n: number): boolean => n >= 5;
/** What the Excuse costs once confirmed: 1–2 nothing, 3–4 half a day. */
export const excuseDeduction = (n: number): 0 | 0.5 => (n >= 3 ? 0.5 : 0);
