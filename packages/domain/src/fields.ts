import type { ModuleKey } from "./permissions.ts";

/**
 * Field permissions (M-09, RECA TECH proposal agreed with the client's admin needs): on top of a role's actions on a
 * module, the admin decides field by field what the role sees — «ظاهر» (show), «قراية بس» (read: shown, not editable)
 * or «مخفي» (hide: gone from the tables, details, forms, filters, exports and documents). The API enforces it; the
 * screens only follow. These rules can only hide more: what the requirements already keep from a role (the owner's
 * number for sales, the commission in a PDF) stays hidden whatever is set here.
 */
export const FIELD_MODES = ["show", "read", "hide"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

export interface FieldDef {
  key: string;
  /** the column's name as the sheet shows it */
  label: string;
  /** the unit's identity: never hidden or locked (code, type, building name) */
  locked?: boolean;
  /** a create form can't be saved without it: not hideable from a role that creates in the module */
  required?: boolean;
  /** what goes with it: derived values (the total from the price) and the other names screens give it */
  covers?: readonly string[];
}

/** Module by module, as phases land (phase 1: the units). */
export const FIELDS: Partial<Record<ModuleKey, readonly FieldDef[]>> = {
  inventory: [
    { key: "code", label: "Code", locked: true },
    { key: "type", label: "Type", locked: true },
    { key: "project", label: "Project", locked: true },
    { key: "area", label: "Area (المنطقة)" },
    { key: "space", label: "Space (المساحة)", covers: ["areaTabId"] },
    { key: "condition", label: "Conditions (التشطيب)" },
    { key: "floor", label: "Floor" },
    { key: "building", label: "Building Number" },
    { key: "parking", label: "Parking Slots" },
    { key: "pricePerSqm", label: "Price / Sqm", covers: ["total", "totalPrice", "yield"] },
    { key: "leasePerSqm", label: "Lease / Sqm", covers: ["monthly", "annual", "yield", "income"] },
    { key: "paymentMethod", label: "Payment method" },
    { key: "maintenance", label: "Maintenance" },
    { key: "commission", label: "Commission" },
    { key: "ownerName", label: "Contact (المالك)" },
    { key: "ownerPhone", label: "Number (رقم المالك)" },
    { key: "agent", label: "Agent", covers: ["agentId"] },
    { key: "location", label: "Location" },
    { key: "layout", label: "Layout" },
    { key: "comment", label: "Comment" },
    { key: "divisible", label: "Divisible (تنفع تتقسم)", covers: ["minSplit", "splitNote"] },
    { key: "lastOwnerUpdateAt", label: "Last update", covers: ["lastUpdate", "stale"] },
    { key: "delivery", label: "Delivery date" },
    { key: "upfront", label: "Upfront rent" },
    { key: "security", label: "Security deposit" },
    { key: "payment", label: "Payment (Rent)" },
    { key: "term", label: "Term" },
    { key: "grace", label: "Grace period" },
    { key: "escalationPct", label: "Annual increase", covers: ["escalation"] },
    { key: "link", label: "Link" },
    { key: "contractDuration", label: "Contract", covers: ["contract"] },
    { key: "startsOn", label: "Start", covers: ["start"] },
    { key: "endsOn", label: "End", covers: ["end"] },
    { key: "tenant", label: "Tenant" },
    { key: "serviceChargeUsd", label: "Service $/m", covers: ["serviceUsd"] },
    { key: "note", label: "Note" },
  ],
};

/** The rules that differ from «show», module by module: a role's, or a person's merged from their roles. */
export type FieldRules = Partial<Record<ModuleKey, Readonly<Record<string, FieldMode>>>>;

const RANK: Record<FieldMode, number> = { show: 2, read: 1, hide: 0 };

/**
 * Several roles: the most permissive wins, like the actions (a role with no rule for a field shows it). So a field is
 * hidden only when every role of the person hides it.
 */
export function mergeFieldRules(roles: readonly FieldRules[]): FieldRules {
  if (!roles.length) return {};
  const out: Partial<Record<ModuleKey, Record<string, FieldMode>>> = {};
  for (const m of Object.keys(FIELDS) as ModuleKey[]) {
    for (const { key } of FIELDS[m]!) {
      const mode = roles.map((r) => r[m]?.[key] ?? "show").reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
      if (mode !== "show") (out[m] ??= {})[key] = mode;
    }
  }
  return out;
}

export interface FieldAccess {
  mode(module: ModuleKey, key: string): FieldMode;
  /** every key hidden in the module, with what each hidden field covers */
  hidden(module: ModuleKey): ReadonlySet<string>;
  /** every key the person may not change (hidden or read only), with what each covers */
  fixed(module: ModuleKey): ReadonlySet<string>;
}

export function fieldAccess(rules: FieldRules): FieldAccess {
  const keys = (m: ModuleKey, test: (mode: FieldMode) => boolean) =>
    new Set((FIELDS[m] ?? []).filter((f) => !f.locked && test(rules[m]?.[f.key] ?? "show")).flatMap((f) => [f.key, ...(f.covers ?? [])]));
  return {
    mode: (m, key) => (FIELDS[m]?.find((f) => f.key === key)?.locked ? "show" : rules[m]?.[key] ?? "show"),
    hidden: (m) => keys(m, (x) => x === "hide"),
    fixed: (m) => keys(m, (x) => x !== "show"),
  };
}

/**
 * Why a role can't get this rule (null = it can): an unknown field, the unit's identity, or a field its create form
 * needs while the role creates in that module.
 */
export function fieldRuleProblem(module: ModuleKey, key: string, mode: FieldMode, roleCreates: boolean): string | null {
  const f = FIELDS[module]?.find((x) => x.key === key);
  if (!f) return "الحقل ده مش موجود";
  if (f.locked && mode !== "show") return `«${f.label}» لازم يفضل ظاهر`;
  if (f.required && mode === "hide" && roleCreates) return `«${f.label}» إجباري في الإضافة: الدور ده بيضيف، فمينفعش يتخفى عنه`;
  return null;
}
