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
