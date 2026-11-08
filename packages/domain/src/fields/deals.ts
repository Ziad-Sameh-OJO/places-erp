import type { FieldDef } from "../fields.ts";

/**
 * M-02 · the Done Deals: the sheet's columns (5.9, the client's «admin done deal 2026») and the drawer's blocks (3.1).
 * The deal's identity, its people and the dates the flow runs on stay shown; the money can be kept from a role.
 */
export const deals: readonly FieldDef[] = [
  { key: "code", label: "الصفقة", locked: true },
  { key: "company", label: "company", locked: true },
  { key: "unitCode", label: "الوحدة", locked: true },
  { key: "status", label: "الحالة", locked: true },
  { key: "buyers", label: "buyer", locked: true },
  { key: "sellers", label: "seller", locked: true },
  { key: "closedAt", label: "deal date", locked: true },
  { key: "type", label: "type", required: true },
  { key: "space", label: "space", required: true },
  { key: "location", label: "location" },
  { key: "source", label: "source" },
  // the expected commission: either side tells the expected total and what's left of it
  { key: "commissionOwner", label: "عمولة متوقعة من الـ Owner", required: true, covers: ["expected", "remaining"] },
  { key: "commissionClient", label: "عمولة متوقعة من الـ Client", required: true, covers: ["expected", "remaining"] },
  { key: "collected", label: "المحصّل (owner side / client side / net commission)", covers: ["collectedOwner", "collectedClient", "payments", "remaining"] },
  { key: "shares", label: "نصيب كل سيلز وعمولته (buyer % / seller %)", covers: ["commission", "achieved"] },
  { key: "note", label: "note", covers: ["targetBase"] },
  { key: "execution", label: "ميعاد التنفيذ", covers: ["execDueAt", "executedAt"] },
  { key: "papers", label: "أوراق الصفقة", covers: ["papersOk", "papersNote"] },
];
