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
