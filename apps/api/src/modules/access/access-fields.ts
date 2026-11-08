import type { UserFilters, UserInput, UserUpdate } from "@places/contracts";

/**
 * M-09 field permissions on the accounts: a hidden field never leaves the API (blank, its kind kept), a filter or search
 * on it is dropped, and a save keeps what the person may not change (a new account starts it empty).
 */
type Keys = ReadonlySet<string>;
interface UserLike {
  email: string; phone: string | null; otpRequired: boolean; lastLoginAt: Date | null; endDate: Date | null;
  employee: { department: string; team: string | null; teamLeaderId: string | null; managerId: string | null } | null;
}

export function hideUser<T extends UserLike>(u: T, h: Keys): T {
  if (!h.size) return u;
  const e = u.employee && {
    ...u.employee, department: h.has("department") ? "" : u.employee.department, team: h.has("team") ? null : u.employee.team,
    teamLeaderId: h.has("teamLeaderId") ? null : u.employee.teamLeaderId, managerId: h.has("managerId") ? null : u.employee.managerId,
  };
  return {
    ...u, email: h.has("email") ? "" : u.email, phone: h.has("phone") ? null : u.phone, otpRequired: h.has("otpRequired") ? false : u.otpRequired,
    lastLoginAt: h.has("lastLoginAt") ? null : u.lastLoginAt, endDate: h.has("endDate") ? null : u.endDate, employee: e,
  };
}

export function shownUserFilters(f: UserFilters, h: Keys): UserFilters {
  return h.has("department") ? { ...f, department: undefined } : f;
}

/** `before` null = a new account: what the person may not set starts empty (email / department can't be: they're required). */
export function keepUser(b: UserUpdate, before: UserLike | null, fixed: Keys): UserUpdate {
  if (!fixed.size) return b;
  const k = (key: string) => fixed.has(key), e = before?.employee;
  return {
    ...b,
    email: k("email") && before ? before.email : b.email,
    department: k("department") && e ? e.department : b.department,
    phone: k("phone") ? before?.phone ?? undefined : b.phone,
    otpRequired: k("otpRequired") ? before?.otpRequired ?? false : b.otpRequired,
    endDate: k("endDate") ? before?.endDate ?? null : b.endDate,
    teamLeaderId: k("teamLeaderId") ? e?.teamLeaderId ?? null : b.teamLeaderId,
    managerId: k("managerId") ? e?.managerId ?? null : b.managerId,
  };
}

/** After keepUser the form is whole again, or the email / department were simply not sent. */
export function wholeUser(b: UserUpdate): UserInput | null {
  return b.email && b.department ? { ...b, email: b.email, department: b.department } : null;
}
