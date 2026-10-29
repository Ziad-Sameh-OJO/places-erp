import type { MatrixValue } from "./matrix";

export interface RoleRow {
  id: string; key: string; label: string; tier: string; scope: "OWN" | "TEAM" | "DEPT" | "ALL";
  behavesLike: string | null; builtIn: boolean; users: number; permissions: MatrixValue;
}
export interface UserRow {
  id: string; email: string; phone: string | null; status: "INVITED" | "ACTIVE" | "LOCKED" | "DISABLED";
  otpRequired: boolean; lastLoginAt: string | null; endDate: string | null; failedLogins: number;
  roles: { primary: boolean; role: { key: string; label: string } }[];
  employee: { id: string; name: string; department: string; jobTitle: string; team: string | null; teamLeaderId: string | null } | null;
  _count: { overrides: number };
}
export const SCOPES: [string, string][] = [["own", "بتاعه بس"], ["team", "فريقه"], ["dept", "قسمه"], ["all", "الكل"]];
export const TIERS: [string, string][] = [
  ["Super Admin", "الملاك / المؤسسين"], ["Office Manager", "مدير المكتب"], ["Operations Head", "مدير العمليات"],
  ["Sales Director", "مدير المبيعات"], ["Department Head", "مدير قسم"], ["Team Leaders", "قادة الفرق"], ["Executive Staff", "الموظفين التنفيذيين"],
];
export const STATUS: Record<UserRow["status"], [string, "ok" | "warn" | "bad" | ""]> = {
  ACTIVE: ["شغال", "ok"], INVITED: ["مستني التفعيل", "warn"], LOCKED: ["مقفول", "bad"], DISABLED: ["متوقف", ""],
};
