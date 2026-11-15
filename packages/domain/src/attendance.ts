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

/**
 * «شرايح وأنواع الخصم» (HR, 15 Nov): the company-wide rules HR sets once (Setting `deductionTiers`): the grace, the
 * tiers, what a day absent without permission costs, and from which Excuse in the month it costs half a day / is refused.
 * A person's own tiers (Q33) still win over the company's three tiers.
 */
export interface DeductionRules extends DeductionTiers {
  readonly graceMinutes: number;
  /** days deducted for a day absent without permission */
  readonly absenceDays: number;
  readonly excuseHalfFrom: number;
  readonly excuseRefusedFrom: number;
}
export const DEFAULT_RULES: DeductionRules = { ...DEFAULT_TIERS, graceMinutes: GRACE_MINUTES, absenceDays: 1, excuseHalfFrom: 3, excuseRefusedFrom: 5 };

/** The stored setting (or nothing yet) as rules: what HR saved over the defaults. */
export const deductionRulesOf = (raw: unknown): DeductionRules =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? { ...DEFAULT_RULES, ...(raw as Partial<DeductionRules>) } : DEFAULT_RULES;

/** The rules for one person: their own tiers if HR set them, else the company's. */
export const rulesFor = (own: DeductionTiers | null, company: DeductionRules): DeductionRules =>
  own ? { ...company, quarterFrom: own.quarterFrom, halfFrom: own.halfFrom, dayFrom: own.dayFrom } : company;

export type DayKind =
  | { kind: "checkin"; minutesAfterStart: number }
  | { kind: "excuse"; minutesAfterStart: number; excuseNumberThisMonth: number }
  | { kind: "visit"; done: boolean }
  | { kind: "outside-approved" }
  | { kind: "forgot-fingerprint"; confirmedByHr: boolean }
  | { kind: "absent-without-permission" }
  | { kind: "special-schedule" };

export interface DayResult {
  /** days deducted: 0, 0.25, 0.5 or 1 (an absence costs what HR set) */
  readonly deduction: number;
  /** minutes counted in Weekly Delay */
  readonly lateMinutes: number;
  readonly label: string;
  /** the 5th Excuse in a month is refused and raises an alert to management and HR (Q31) */
  readonly alertManagement: boolean;
}

const lateMinutes = (m: number, grace: number): number => Math.max(0, m - grace);

function byTiers(m: number, t: DeductionTiers): number {
  if (m >= t.dayFrom) return 1;
  if (m >= t.halfFrom) return 0.5;
  if (m >= t.quarterFrom) return 0.25;
  return 0;
}

/** `rules`: a person's tiers alone (the rest from the defaults) or the full rules (rulesFor()). */
export function attendanceDay(day: DayKind, rules: DeductionTiers | DeductionRules = DEFAULT_RULES): DayResult {
  const r: DeductionRules = { ...DEFAULT_RULES, ...rules };
  switch (day.kind) {
    case "special-schedule": return { deduction: 0, lateMinutes: 0, label: "مواعيد خاصة", alertManagement: false };
    case "absent-without-permission": return { deduction: r.absenceDays, lateMinutes: 0, label: "غياب من غير إذن", alertManagement: false };
    case "outside-approved": return { deduction: 0, lateMinutes: 0, label: "شغل من بره (معتمد)", alertManagement: false };
    case "forgot-fingerprint": return { deduction: day.confirmedByHr ? 1 : 0, lateMinutes: 0, label: "نسي البصمة", alertManagement: false };
    // Q29: a Visit never gets a deduction; one marked not done is flagged to HR
    case "visit": return { deduction: 0, lateMinutes: 0, label: day.done ? "Visit" : "Visit · معملهاش", alertManagement: false };
    case "excuse": {
      const n = day.excuseNumberThisMonth, late = lateMinutes(day.minutesAfterStart, r.graceMinutes);
      if (excuseRefused(n, r)) return { deduction: byTiers(day.minutesAfterStart, r), lateMinutes: late, label: `Excuse #${n} اترفض`, alertManagement: true };
      return { deduction: excuseDeduction(n, r), lateMinutes: late, label: `Excuse #${n}`, alertManagement: false };
    }
    case "checkin": {
      const d = byTiers(day.minutesAfterStart, r);
      return { deduction: d, lateMinutes: lateMinutes(day.minutesAfterStart, r.graceMinutes), label: d ? "متأخر" : "في الميعاد", alertManagement: false };
    }
  }
}

/** One day's pay: salary ÷ 26 working days. */
export const dayRate = (monthlySalary: number): number => monthlySalary / 26;

/**
 * Per-person tiers (M-05 3.1, Q33): HR picks the minute each deduction starts. Why they can't be saved, or null:
 * after the 16-minute grace, in order quarter < half < day, within the working day.
 */
export function tiersProblem(t: DeductionTiers, grace = GRACE_MINUTES): string | null {
  const ok = (n: number) => Number.isInteger(n) && n > grace && n <= 8 * 60;
  if (![t.quarterFrom, t.halfFrom, t.dayFrom].every(ok)) return `الشرايح بتبدأ بعد ${grace} دقيقة ولحد آخر اليوم`;
  if (!(t.quarterFrom < t.halfFrom && t.halfFrom < t.dayFrom)) return "الربع قبل النص، والنص قبل اليوم";
  return null;
}

/**
 * The company's rules (HR, 15 Nov), or why they can't be saved: the tiers as tiersProblem() after the grace, an absence
 * a quarter-day step up to 3 days, the half-day Excuse no later than the refused one.
 */
export function rulesProblem(r: DeductionRules): string | null {
  if (!Number.isInteger(r.graceMinutes) || r.graceMinutes < 0 || r.graceMinutes > 120) return "السماح من 0 لـ 120 دقيقة";
  const tiers = tiersProblem(r, r.graceMinutes);
  if (tiers) return tiers;
  if (!(r.absenceDays > 0 && penaltyDaysOk(r.absenceDays))) return "الغياب بيتخصم ربع يوم أو نص أو أيام لحد 3";
  const n = (x: number) => Number.isInteger(x) && x >= 1 && x <= 31;
  if (!(n(r.excuseHalfFrom) && n(r.excuseRefusedFrom) && r.excuseHalfFrom <= r.excuseRefusedFrom)) return "الـ Excuse اللي بنص يوم مايجيش بعد اللي بيترفض";
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
  /** a person's own tiers, or the rules from rulesFor() (null = the defaults) */
  tiers: DeductionTiers | DeductionRules | null;
  /** a person with fixed hours of their own (e.g. the CFO on Mon & Thu): no tiers against 11:00 */
  specialSchedule: boolean;
}
/**
 * One fingerprint day: the tiers against 11:00 (per-person tiers if HR set them); a part-timer without deductions
 * and a special schedule get none; Weekly Delay still counts every minute after 11:16 (M-05 3.2).
 */
export function fingerprintDay(i: FingerprintDayInput): DayResult {
  if (i.specialSchedule) return attendanceDay({ kind: "special-schedule" });
  const r = attendanceDay({ kind: "checkin", minutesAfterStart: minutesAfterStart(i.checkIn ?? WORK_START) }, i.tiers ?? DEFAULT_RULES);
  if (i.partTime && !i.partTimeDeductions) return { ...r, deduction: 0, label: "Part-time" };
  return r;
}

/** The deduction in money: a day = salary ÷ 26 (piasters, rounded). */
export const deductionAmount = (salaryPiasters: number, fraction: number): number => Math.round((salaryPiasters / 26) * fraction);

/**
 * The month's line on the payroll sheet (M-05 (32) · 6.2 · 7.9): attendance days (Excuses already in them) plus approved
 * penalty days, each at salary ÷ 26, rounded once on the total (the demo's «أيام الخصم × يومية»). Never above the salary.
 * 11.6: `kpi` is a closed quarter's KPI reward (+) or deduction (−) landing this month: a reward lowers the line (below
 * zero = paid on top of the salary), a deduction raises it, still never above the salary.
 */
export function monthDeduction(i: { salary: number; attendanceDays: number; penaltyDays: number; kpi?: number }): { days: number; amount: number } {
  const days = i.attendanceDays + i.penaltyDays;
  return { days, amount: Math.min(i.salary, Math.min(i.salary, deductionAmount(i.salary, days)) - (i.kpi ?? 0)) };
}

/* ---- penalties (7.7) and the 1-to-1 (7.8) ---- */
/** A penalty's deduction in days: none, a quarter, a half, or whole days up to 3 (M-05 3.1). */
export const penaltyDaysOk = (d: number): boolean => d >= 0 && d <= 3 && Number.isInteger(d * 4);
/** A penalty reaches the deductions only once HR approved it. */
export const penaltyCounts = (status: string): boolean => status === "approved";
/** «Employee Box» (HR, 15 Nov): any penalty this month that wasn't rejected (pending too) rules the person out. */
export const penaltyBlocksIdeal = (status: string): boolean => status !== "rejected";
/** The 1-to-1 is monthly (M-05): the next one is due in the month after the last (25/10 → November). */
export function oneOnOneDue(lastHeld: string | null, today: string): "due" | "done" {
  if (!lastHeld) return "due";
  return lastHeld.slice(0, 7) >= today.slice(0, 7) ? "done" : "due";
}
/**
 * 7.15 · the employees list's «حل HR» (demo hr.js emps()): the first open action's date, red once its day came (`<=`
 * today, like the alarm), null when nothing is open.
 */
export function openHrAction(dues: readonly string[], today: string): { due: string; overdue: boolean } | null {
  const first = [...dues].sort()[0];
  return first ? { due: first, overdue: first <= today } : null;
}
/** «حل الـ HR» rings on its day, once, until it's done. */
export const actionAlarm = (due: string | null, today: string, done: boolean, alarmed: boolean): boolean => !!due && !done && !alarmed && due <= today;

/* ---- the Excuse (7.4) ---- */
/** This request's number in the month: the ones not rejected before it + 1 (Q31). */
export const excuseNumber = (earlierThisMonth: number): number => earlierThisMonth + 1;
/** The 5th Excuse in a month (HR can move it) is refused at once and management hears of it (Q31: «الخامس رفد»). */
export const excuseRefused = (n: number, r: DeductionRules = DEFAULT_RULES): boolean => n >= r.excuseRefusedFrom;
/** What the Excuse costs once confirmed: 1–2 nothing, from the 3rd (HR can move it) half a day. */
export const excuseDeduction = (n: number, r: DeductionRules = DEFAULT_RULES): 0 | 0.5 => (n >= r.excuseHalfFrom ? 0.5 : 0);

/* ---- a salesperson's day with a Visit (7.3) ---- */
/** A Visit up to 12:00 is a check-in without lateness; after 12 the day is late up to the Visit (M-05 2.1 · 7.1). */
export const VISIT_ON_TIME_UNTIL = "12:00";
/** One Visit of the day: its Cairo time, Done / «معملتهاش» / not marked, and whether the TL approved postponing it (1.24). */
export interface DayVisit { readonly at: string; readonly outcome: "done" | "not_done" | null; readonly postponed: boolean }

/** The Visit that decides the day: an approved postponement first, then the earliest not marked «معملتهاش», else the earliest. */
export function pickDayVisit(visits: readonly DayVisit[]): DayVisit | null {
  const byTime = [...visits].sort((a, b) => a.at.localeCompare(b.at));
  return byTime.find((v) => v.postponed) ?? byTime.find((v) => v.outcome !== "not_done") ?? byTime[0] ?? null;
}

/** When the day started: the Visit time (Done or not marked yet) even if the fingerprint came after it, else the fingerprint. */
export function dayStartTime(checkIn: string | null, visit: DayVisit | null): string | null {
  if (!visit || visit.outcome === "not_done" || visit.postponed) return checkIn;
  return checkIn && checkIn < visit.at ? checkIn : visit.at;
}

/**
 * A salesperson's day with a Visit (4 Nov demo meeting): Done or not marked → the day starts at the Visit (no lateness up
 * to 12:00, after it the tiers up to the Visit); «معملتهاش» → back to the fingerprint with its deduction (HR is told by
 * the lead rules), no fingerprint = no start (null); a postponement the TL approved (1.24) → no deduction that day.
 */
export function visitDay(i: FingerprintDayInput, v: DayVisit): DayResult | null {
  if (v.postponed) return { deduction: 0, lateMinutes: 0, label: "Visit اتأجلت (معتمد)", alertManagement: false };
  const start = dayStartTime(i.checkIn, v);
  if (!start) return null;
  const r = fingerprintDay({ ...i, checkIn: start });
  if (v.outcome === "not_done") return { ...r, label: "Visit · معملهاش" };
  return { ...r, deduction: v.at <= VISIT_ON_TIME_UNTIL ? 0 : r.deduction, label: "Visit" };
}

/** 1.23 · today's rotation: the earliest start first, nobody started yet last; a manual order for the day wins and someone not in it joins the end. */
export function dayRotation(ids: readonly string[], starts: ReadonlyMap<string, string>, manual: readonly string[] | null): string[] {
  const auto = [...ids].sort((a, b) => (starts.get(a) ?? "99").localeCompare(starts.get(b) ?? "99"));
  if (!manual) return auto;
  const rank = (id: string) => (manual.includes(id) ? manual.indexOf(id) : manual.length + auto.indexOf(id));
  return auto.sort((a, b) => rank(a) - rank(b));
}
