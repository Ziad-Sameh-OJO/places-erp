import type { FieldDef } from "../fields.ts";

/** M-10 · the clients and owners: the list's columns and the file's rows (demo clients.js). Nothing here is typed in a form. */
export const clients: readonly FieldDef[] = [
  { key: "name", label: "الاسم", locked: true },
  { key: "kind", label: "النوع", locked: true },
  { key: "status", label: "الحالة", locked: true },
  { key: "company", label: "الشركة" },
  { key: "phones", label: "الأرقام" },
  { key: "units", label: "الوحدات" },
  { key: "deals", label: "الصفقات" },
  { key: "balance", label: "دفع · عليه" },
  { key: "lastContactAt", label: "آخر تواصل" },
  { key: "contracts", label: "العقود" },
  { key: "marketingConsent", label: "موافق على التواصل التسويقي" },
  { key: "deletionAsked", label: "طلب مسح البيانات" },
  { key: "timeline", label: "التاريخ كله" },
];
