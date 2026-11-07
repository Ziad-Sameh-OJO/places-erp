import type { MatrixValue } from "./matrix";

export interface RoleRow {
  id: string; key: string; label: string; tier: string; scope: "OWN" | "TEAM" | "DEPT" | "ALL";
  behavesLike: string | null; builtIn: boolean; users: number; permissions: MatrixValue;
}
export interface UserRow {
  id: string; email: string; phone: string | null; status: "INVITED" | "ACTIVE" | "LOCKED" | "DISABLED";
  otpRequired: boolean; lastLoginAt: string | null; endDate: string | null; failedLogins: number;
  roles: { primary: boolean; role: { key: string; label: string } }[];
  employee: { id: string; name: string; department: string; jobTitle: string; team: string | null; teamLeaderId: string | null; managerId: string | null } | null;
  _count: { overrides: number };
}
/** Data scopes; their names are access.scopes.<key>. */
export const SCOPES = ["own", "team", "dept", "all"] as const;
/** The tiers (stored in English) with the key of their gloss in access.tiers. */
export const TIERS = [
  ["Super Admin", "superAdmin"], ["Office Manager", "officeManager"], ["Operations Head", "operationsHead"],
  ["Sales Director", "salesDirector"], ["Department Head", "departmentHead"], ["Team Leaders", "teamLeaders"], ["Executive Staff", "executiveStaff"],
] as const;
/** The chip tone of each account status; the name is access.status.<status>. */
export const STATUS: Record<UserRow["status"], "ok" | "warn" | "bad" | ""> = {
  ACTIVE: "ok", INVITED: "warn", LOCKED: "bad", DISABLED: "",
};
