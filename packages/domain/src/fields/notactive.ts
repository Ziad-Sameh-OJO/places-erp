import type { FieldDef } from "../fields.ts";

/**
 * M-03 1.1 · the Not Active sheets: their columns are the uploaded file's own, so the one the system knows is the
 * owner's number (the sheet's «Number» column, `numberBy`); and Marwa's feedback.
 */
export const notactive: readonly FieldDef[] = [
  { key: "status", label: "الحالة", locked: true },
  { key: "number", label: "Number (رقم المالك)" },
  { key: "feedback", label: "Feedback" },
];
