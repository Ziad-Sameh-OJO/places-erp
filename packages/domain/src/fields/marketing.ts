import type { FieldDef } from "../fields.ts";

/**
 * M-04 · the campaigns (2.1 step 1 · 3.1): the money (budget, what was spent and the cost per lead it gives), the target
 * and the ad link, the notes. Posts and Broadcasts go out to everyone anyway: nothing in them to hide.
 */
export const marketing: readonly FieldDef[] = [
  { key: "name", label: "الكامبين", locked: true },
  { key: "channel", label: "Channel", locked: true },
  { key: "period", label: "الفترة", locked: true },
  { key: "page", label: "Page name", locked: true },
  { key: "budget", label: "الميزانية" },
  { key: "spent", label: "اتصرف", covers: ["costPerLead", "costPerQualified"] },
  { key: "target", label: "المشروع / الوحدات المستهدفة" },
  { key: "adUrl", label: "لينك الإعلان" },
  { key: "note", label: "ملاحظات" },
];
