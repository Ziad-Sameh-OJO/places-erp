import type { FieldDef } from "../fields.ts";

/**
 * M-12 · the KPI card: the money it moves (11.4; the watcher never sees it anyway, 11.14), the quarter's result and the
 * improvement plan. The employee and the item's title are the card itself.
 */
export const kpis: readonly FieldDef[] = [
  { key: "employee", label: "الموظف", locked: true },
  { key: "title", label: "البند", locked: true },
  { key: "money", label: "المكافأة / الخصم", covers: ["pay", "bands"] },
  { key: "score", label: "نتيجة الربع", covers: ["tier", "tone", "achievement", "contribution", "avg"] },
  { key: "plan", label: "خطة التحسين" },
];
