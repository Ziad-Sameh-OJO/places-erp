import type { FieldDef } from "../fields.ts";

/**
 * M-05 · the employee file (7.1) and the money HR reads off it: attendance (7.2), «التوفير» (7.9), penalties (7.7), the
 * team fund (7.11). A deduction is a share of the salary, so hiding the salary hides every amount computed from it.
 */
export const hr: readonly FieldDef[] = [
  { key: "name", label: "الموظف", locked: true },
  { key: "department", label: "القسم", locked: true },
  { key: "jobTitle", label: "الوظيفة", locked: true },
  { key: "salary", label: "المرتب", covers: ["deductionAmount", "amount", "net", "kpi", "fund"] },
  { key: "deductionAmount", label: "مبلغ الخصم", covers: ["amount", "net", "kpi", "fund"] },
  { key: "target", label: "التارجت" },
  { key: "commissionPct", label: "نسبة العمولة" },
  { key: "partTime", label: "الدوام", covers: ["partTimeDeductions"] },
  { key: "deductionTiers", label: "شرايح الخصم", covers: ["customTiers"] },
  { key: "fixedSchedule", label: "مواعيد خاصة" },
  { key: "joinedAt", label: "بدأ الشغل" },
  { key: "email", label: "الإيميل" },
  { key: "manager", label: "بيتابعه" },
  { key: "team", label: "الفريق" },
];
