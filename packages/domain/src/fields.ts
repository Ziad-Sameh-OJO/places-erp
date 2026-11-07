import type { ModuleKey } from "./permissions.ts";
import { inventory } from "./fields/inventory.ts";
import { leads } from "./fields/leads.ts";
import { deals } from "./fields/deals.ts";
import { clients } from "./fields/clients.ts";
import { contracts } from "./fields/contracts.ts";
import { notactive } from "./fields/notactive.ts";
import { tasks } from "./fields/tasks.ts";
import { marketing } from "./fields/marketing.ts";
import { hr } from "./fields/hr.ts";
import { tickets } from "./fields/tickets.ts";
import { finance } from "./fields/finance.ts";
import { procurement } from "./fields/procurement.ts";
import { reports } from "./fields/reports.ts";
import { kpis } from "./fields/kpis.ts";
import { access } from "./fields/access.ts";

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

/** Module by module (one file each, so modules are added side by side); a module with no fields isn't offered. */
export const FIELDS: Partial<Record<ModuleKey, readonly FieldDef[]>> = Object.fromEntries(
  Object.entries({ inventory, leads, deals, clients, contracts, notactive, tasks, marketing, hr, tickets, finance, procurement, reports, kpis, access }).filter(([, f]) => f.length),
);

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
