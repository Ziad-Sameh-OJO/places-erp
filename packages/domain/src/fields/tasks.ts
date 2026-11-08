import type { FieldDef } from "../fields.ts";

/**
 * M-04 · the tasks between departments: the unit's owner and place that come with a shoot, and the notes. The owner's
 * number stays the photographer's and the owner-number roles' only (M-04 2.1 step 5, M-10 4.1); this can hide it more.
 */
export const tasks: readonly FieldDef[] = [
  { key: "kind", label: "النوع", locked: true },
  { key: "title", label: "المهمة", locked: true },
  { key: "unit", label: "الوحدة", locked: true },
  { key: "to", label: "المسؤول", locked: true },
  { key: "dueOn", label: "الميعاد", locked: true },
  { key: "status", label: "الحالة", locked: true },
  { key: "place", label: "مكان الوحدة", covers: ["area", "floor", "building"] },
  { key: "ownerName", label: "المالك" },
  { key: "ownerPhone", label: "رقم المالك" },
  { key: "note", label: "ملاحظات" },
];
