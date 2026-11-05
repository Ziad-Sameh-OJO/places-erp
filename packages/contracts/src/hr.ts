import { z } from "zod";
import { CalendarDay, Money } from "./common.ts";

/** M-05 · the employee file (7.1): what HR writes about each person (3.1). */
export interface EmployeeRow {
  id: string; userId: string; name: string; jobTitle: string; department: string; partTime: boolean;
  salary: string; target: string; commissionPct: string; leaveBalance: number; customTiers: boolean;
}
export interface EmployeeFile extends EmployeeRow {
  email: string; manager: { id: string; name: string } | null; team: string | null; joinedAt: string | null;
  partTimeDeductions: boolean; deductionTiers: { quarterFrom: number; halfFrom: number; dayFrom: number } | null; fixedSchedule: string | null;
}
export interface EmployeesView { items: EmployeeRow[]; departments: string[] }

export const EmployeeFilters = z.object({ q: z.string().trim().max(80).optional(), department: z.string().max(80).optional() });
export type EmployeeFilters = z.infer<typeof EmployeeFilters>;

const Tiers = z.object({ quarterFrom: z.number().int(), halfFrom: z.number().int(), dayFrom: z.number().int() });
/** «البيانات» (demo empEdit): salary is required; tiers null = the company's default tiers. */
export const EmployeePatch = z.object({
  salary: Money,
  target: Money.optional(),
  commissionPct: z.number().min(0).max(100).optional(),
  partTime: z.boolean().optional(),
  partTimeDeductions: z.boolean().optional(),
  leaveBalance: z.number().int().min(0).max(60).optional(),
  joinedAt: CalendarDay.nullable().optional(),
  deductionTiers: Tiers.nullable().optional(),
  fixedSchedule: z.string().trim().max(120).nullable().optional(),
});
export type EmployeePatch = z.infer<typeof EmployeePatch>;

/* ---- 7.2 · 7.10 · 7.12 · attendance ---- */
export interface AttendanceRowView {
  employeeId: string; name: string; department: string; day: string; checkIn: string | null; checkOut: string | null;
  lateMinutes: number; deduction: number; deductionAmount: string; label: string; source: string; customTiers: boolean; fixedSchedule: string | null;
}
/** «حضور النهارده»: the day's rows, who didn't check in (a working day only), the unmatched names waiting for HR. */
export interface AttendanceDayView {
  day: string; working: boolean; holiday: string | null; rows: AttendanceRowView[]; missing: { employeeId: string; name: string; department: string }[];
  unmatched: { id: string; name: string; day: string; checkIn: string | null }[];
  totals: { present: number; late: number; deductions: string };
}
export const AttendanceDayQuery = z.object({ day: CalendarDay.optional() });
export const AttendanceRange = z.object({ from: CalendarDay, to: CalendarDay, employeeId: z.string().min(1).optional() });
export type AttendanceRange = z.infer<typeof AttendanceRange>;
export interface AttendanceHistoryView { employee: { id: string; name: string } | null; rows: AttendanceRowView[]; totals: { late: number; deductionDays: number; deductions: string } }
/** «Weekly Delay»: every minute after 11:16 per person per day, whatever the reason. */
export interface WeeklyDelayView { days: string[]; people: { employeeId: string; name: string; byDay: Record<string, { late: number; label: string }>; total: number }[] }

/** The fingerprint sheet (Excel / CSV from the device): name, date, in, out. */
export const FINGERPRINT_COLUMNS = { name: "الاسم", day: "التاريخ", checkIn: "الدخول", checkOut: "الخروج" } as const;
const Hhmm = z.string().trim().regex(/^\d{1,2}[:.]?\d{2}(:\d{2})?$/, "الوقت بالشكل 11:05");
export const FingerprintRow = z.object({
  name: z.string().trim().min(2, "الاسم ناقص").max(120),
  day: CalendarDay,
  checkIn: Hhmm,
  checkOut: Hhmm.optional(),
});
export type FingerprintRow = z.infer<typeof FingerprintRow>;
export interface FingerprintDone { imported: number; skipped: number; unmatched: number }

/** «استكمال الأيام»: HR enters a day the device missed (or corrects one). */
export const AttendanceEntry = z.object({ employeeId: z.string().min(1), day: CalendarDay, checkIn: Hhmm, checkOut: Hhmm.optional() });
export type AttendanceEntry = z.infer<typeof AttendanceEntry>;
export const LinkUnmatched = z.object({ employeeId: z.string().min(1) });

/* ---- 7.5 · 7.6 · leaves ---- */
export const LeaveAsk = z.object({
  type: z.string().trim().min(1).max(40),
  from: CalendarDay, to: CalendarDay,
  reason: z.string().trim().max(300).optional(),
  documentId: z.string().min(1).optional(),
});
export type LeaveAsk = z.infer<typeof LeaveAsk>;
export const LeaveReject = z.object({ reason: z.string().trim().min(2, "اكتب سبب الرفض").max(300) });
export type LeaveStatusKey = "PENDING_TL" | "APPROVED_BY_TL" | "REJECTED" | "CLOSED_BY_HR";
export interface LeaveView {
  id: string; employeeId: string; name: string; type: string; from: string; to: string; days: number; reason: string | null;
  status: LeaveStatusKey; statusLabel: string; rejectReason: string | null; hasDocument: boolean; createdAt: string;
  /** what the person looking can do now */
  canDecide: "tl" | "hr" | null;
}
export interface LeaveBalance { type: string; total: number; used: number; left: number }
export interface MyLeaves { items: LeaveView[]; balances: LeaveBalance[]; types: { name: string; afterReturn: boolean }[] }
export interface LeaveCalendarView { month: string; byDay: Record<string, { name: string; type: string }[]>; today: { employeeId: string; name: string; type: string; to: string }[] }
export interface LeaveBalancesView { month: string; types: string[]; rows: { employeeId: string; name: string; department: string; byType: Record<string, { total: number; used: number; month: number; left: number }> }[] }
export const MonthQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "الشهر بالشكل 2026-11").optional() });

/* ---- 7.9 · «التوفير»: the month's deductions HR approves for payroll ---- */
export interface DeductionRowView { employeeId: string; name: string; salary: string; attendanceDays: number; penaltyDays: number; lateMinutes: number; /** 11.6: a closed quarter's KPI reward (+) or deduction (−), already inside `amount` */ kpi: string; amount: string; net: string }
export interface DeductionsView {
  month: string; rows: DeductionRowView[]; totals: { salary: string; amount: string; net: string; people: number };
  approved: { by: string; at: string } | null;
}

/* ---- 7.11 · the ideal employee and the team fund (M-05, client sheet 28/10) ---- */
export interface IdealRowView { employeeId: string; name: string; earlyDays: number; lateHours: number; absentDays: number; kpi: number | null; points: number; status: "ideal" | "penalty" | "kpi" | null }
export interface IdealTeamView { name: string; winner: { employeeId: string; name: string } | null; fund: string; rows: IdealRowView[] }
export interface IdealView { month: string; teams: IdealTeamView[] }

/* ---- 7.7 · penalties · 7.8 · the 1-to-1 ---- */
export const NewPenalty = z.object({
  employeeId: z.string().min(1), day: CalendarDay,
  text: z.string().trim().min(2, "اكتب الجزاء").max(300),
  deductionDays: z.number().min(0).max(3).default(0),
});
export type NewPenalty = z.infer<typeof NewPenalty>;
export interface PenaltyView { id: string; employeeId: string; name: string; day: string; text: string; deductionDays: number; deductionAmount: string; status: "pending" | "approved" | "rejected"; by: string; canDecide: boolean }
export interface PenaltiesView { month: string; items: PenaltyView[]; totals: { approved: number; pending: number; deductions: string } }

export const OneQuestions = z.object({ questions: z.array(z.string().trim().min(2).max(200)).min(1).max(20) });
export const NewOneOnOne = z.object({
  heldOn: CalendarDay,
  answers: z.record(z.string(), z.string().max(2000)),
  hrAction: z.string().trim().max(300).optional(),
  hrActionDue: CalendarDay.optional(),
});
export type NewOneOnOne = z.infer<typeof NewOneOnOne>;
export interface OneOnOneView { id: string; heldOn: string; answers: Record<string, string>; hrAction: string | null; hrActionDue: string | null; hrActionDone: boolean; by: string }
export interface OneOnOnesView { questions: string[]; due: boolean; items: OneOnOneView[] }
export interface HrActionsView { items: { id: string; employeeId: string; name: string; action: string; due: string; late: boolean }[] }

/* ---- 7.4 · the Excuse ---- */
export const ExcuseAsk = z.object({ day: CalendarDay, reason: z.string().trim().min(2, "اكتب السبب").max(300) });
export type ExcuseAsk = z.infer<typeof ExcuseAsk>;
export type ExcuseStatus = "pending_tl" | "approved_tl" | "confirmed" | "rejected" | "refused";
export interface ExcuseView {
  id: string; employeeId: string; name: string; day: string; reason: string; number: number; status: ExcuseStatus; statusLabel: string;
  cost: string; rejectReason: string | null; ticket: string | null; canDecide: "tl" | "hr" | null;
}
