import type { FieldDef } from "../fields.ts";

/**
 * M-12 · 11.8 · the targets and the Transactions: the money per person — the target, what came in against it (and the
 * percent the two give), the TL's commission (and its tier), what each deal collected.
 */
export const reports: readonly FieldDef[] = [
  { key: "name", label: "السيلز", locked: true },
  { key: "value", label: "التارجت (نصيبه من الكوميشن)", covers: ["goal", "pending", "percent", "avg", "behind"] },
  { key: "achieved", label: "دخل في التارجت", covers: ["percent", "avg", "behind"] },
  { key: "commission", label: "عمولة الـ TL", covers: ["tierPercent"] },
  { key: "collected", label: "اتحصّل" },
];
