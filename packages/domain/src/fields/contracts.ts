import type { FieldDef } from "../fields.ts";

/** M-11 · the contracts: the list's columns, the drawer's rows and the installment table (demo clients.js V.contracts). */
export const contracts: readonly FieldDef[] = [
  { key: "code", label: "العقد", locked: true },
  { key: "client", label: "العميل", locked: true },
  { key: "unitCode", label: "الوحدة", locked: true },
  { key: "dealCode", label: "الصفقة", locked: true },
  { key: "startsOn", label: "البداية", locked: true },
  { key: "endsOn", label: "النهاية", locked: true },
  { key: "status", label: "الحالة", locked: true },
  { key: "value", label: "القيمة", required: true, covers: ["nextYearValue", "pending"] },
  { key: "escalation", label: "الزيادة السنوية", covers: ["nextYearValue"] },
  // the table's amounts and dates, the calendar's installments, the late ones and the Aging
  { key: "installments", label: "جدول الأقساط", required: true, covers: ["late", "aging"] },
  // what was collected: per contract, per installment, the payments and their receipts, the collections report
  { key: "paid", label: "المدفوع", covers: ["payments", "collected"] },
  { key: "file", label: "ملف العقد", required: true },
  { key: "penalty", label: "الغرامة" },
];
