import type { AttendanceRowView, DeductionRowView, EmployeeFile, EmployeePatch, EmployeeRow, PenaltyView } from "@places/contracts";

/**
 * M-09 field permissions on the HR screens: a hidden field's value never leaves the API (blank, its kind kept), and a
 * save keeps what the person may not change. `hidden` / `fixed` come from `me.fields` (the keys with what they cover).
 */
type Keys = ReadonlySet<string>;
const NONE = "0.00";

export function hideEmployee<T extends EmployeeRow>(e: T, h: Keys): T {
  if (!h.size) return e;
  const out: EmployeeRow = {
    ...e, salary: h.has("salary") ? NONE : e.salary, target: h.has("target") ? NONE : e.target, commissionPct: h.has("commissionPct") ? NONE : e.commissionPct,
    partTime: h.has("partTime") ? false : e.partTime, customTiers: h.has("customTiers") ? false : e.customTiers,
  };
  if (!("email" in e)) return out as T;
  const f = e as unknown as EmployeeFile;
  return {
    ...out, email: h.has("email") ? "" : f.email, manager: h.has("manager") ? null : f.manager, team: h.has("team") ? null : f.team,
    joinedAt: h.has("joinedAt") ? null : f.joinedAt, partTimeDeductions: h.has("partTimeDeductions") ? false : f.partTimeDeductions,
    deductionTiers: h.has("deductionTiers") ? null : f.deductionTiers, fixedSchedule: h.has("fixedSchedule") ? null : f.fixedSchedule,
  } as unknown as T;
}

/** The file's «البيانات» save: a field the person may not change keeps its stored value. */
export function keepEmployee(p: EmployeePatch, before: EmployeeFile, fixed: Keys): EmployeePatch {
  if (!fixed.size) return p;
  const k = (key: string) => fixed.has(key);
  return {
    ...p, salary: k("salary") ? before.salary : p.salary,
    ...(k("target") ? { target: undefined } : {}), ...(k("commissionPct") ? { commissionPct: undefined } : {}),
    ...(k("partTime") ? { partTime: undefined } : {}), ...(k("partTimeDeductions") ? { partTimeDeductions: undefined } : {}),
    ...(k("joinedAt") ? { joinedAt: undefined } : {}), ...(k("deductionTiers") ? { deductionTiers: undefined } : {}),
    ...(k("fixedSchedule") ? { fixedSchedule: undefined } : {}),
  };
}

export function hideAttendance(r: AttendanceRowView, h: Keys): AttendanceRowView {
  if (!h.size) return r;
  return { ...r, deductionAmount: h.has("deductionAmount") ? NONE : r.deductionAmount, customTiers: h.has("customTiers") ? false : r.customTiers,
    fixedSchedule: h.has("fixedSchedule") ? null : r.fixedSchedule };
}

export function hideDeduction(r: DeductionRowView, h: Keys): DeductionRowView {
  if (!h.size) return r;
  return { ...r, salary: h.has("salary") ? NONE : r.salary, kpi: h.has("kpi") ? NONE : r.kpi, amount: h.has("amount") ? NONE : r.amount, net: h.has("net") ? NONE : r.net };
}

export function hidePenalty(p: PenaltyView, h: Keys): PenaltyView {
  return h.has("deductionAmount") ? { ...p, deductionAmount: NONE } : p;
}

/** A total over hidden amounts would tell them. */
export const hiddenTotal = (h: Keys, key: string, v: string) => (h.has(key) ? NONE : v);
