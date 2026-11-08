import type { FieldDef } from "../fields.ts";

/**
 * M-08 · purchase requests. A hidden «المبلغ» takes the budget figures with it (what a line spent includes the posted
 * requests, so it would tell their amounts). The request's number, the item, who asked and the status stay.
 */
export const procurement: readonly FieldDef[] = [
  { key: "no", label: "الطلب", locked: true },
  { key: "item", label: "الحاجة", locked: true },
  { key: "createdBy", label: "طلبه", locked: true },
  { key: "status", label: "الحالة", locked: true },
  { key: "amount", label: "المبلغ", required: true, covers: ["budgetLeft", "overBudget", "spent", "left", "pct", "level", "balance"] },
  { key: "account", label: "البند", required: true, covers: ["budgetLeft"] },
  { key: "vendor", label: "المورد" },
  { key: "rejectReason", label: "سبب الرفض" },
];
