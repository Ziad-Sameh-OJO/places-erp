import type { FieldDef } from "../fields.ts";

/**
 * M-07 · the accounts. A hidden «المبلغ» takes every number of money with it (balances, debit / credit, the budget,
 * payroll, statements, claims, commission statements): a balance or a total is a sum of amounts, so showing one would
 * tell the others. The number, the date and the account stay: an entry means nothing without them.
 */
export const finance: readonly FieldDef[] = [
  { key: "no", label: "الرقم", locked: true },
  { key: "date", label: "التاريخ", locked: true },
  { key: "account", label: "الحساب", locked: true },
  {
    key: "amount", label: "المبلغ", required: true,
    covers: ["balance", "debit", "credit", "spent", "returned", "budget", "left", "pct", "level", "alerts", "paid", "received", "before", "after",
      "assets", "liabilities", "equity", "revenue", "direct", "gross", "selling", "contribution", "admin", "other", "net", "value",
      "salary", "attendance", "advance", "advanceLeft", "share", "schemePercent", "commission", "placesCommission", "tlDue", "marketing", "remaining"],
  },
  { key: "memo", label: "البيان", required: true },
  { key: "party", label: "الطرف", required: true },
  { key: "ref", label: "رقم الفاتورة / المرجع" },
  { key: "vendor", label: "المورد", required: true },
];
