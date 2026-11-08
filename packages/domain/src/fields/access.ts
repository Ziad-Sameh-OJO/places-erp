import type { FieldDef } from "../fields.ts";

/** M-09 · the accounts (5.2): who the person is and what they do stay; their contact and login details can be kept back. */
export const access: readonly FieldDef[] = [
  { key: "name", label: "الاسم", locked: true },
  { key: "roles", label: "الأدوار", locked: true },
  { key: "status", label: "الحالة", locked: true },
  { key: "email", label: "الإيميل", required: true },
  { key: "department", label: "القسم", required: true },
  { key: "phone", label: "الموبايل" },
  { key: "lastLoginAt", label: "آخر دخول" },
  { key: "otpRequired", label: "OTP" },
  { key: "endDate", label: "آخر يوم شغل" },
  { key: "teamLeader", label: "الـ Team Leader", covers: ["teamLeaderId", "team"] },
  { key: "manager", label: "المدير المباشر", covers: ["managerId"] },
];
