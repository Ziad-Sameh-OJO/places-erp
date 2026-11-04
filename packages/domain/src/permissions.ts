/**
 * M-09 · permissions. Every role has, per module, a set of actions; a person can hold several roles (Q48: the union
 * applies) and can have per-person overrides that replace their roles' set for one module. Plus a data scope.
 * This is the pure rule; the API turns it into CASL abilities and checks it on every endpoint.
 */
export const ACTIONS = ["view", "create", "edit", "approve", "delete", "import", "export"] as const;
export type Action = (typeof ACTIONS)[number];

export const MODULES = [
  "home", "leads", "deals", "settings", "clients", "contracts", "inventory", "notactive", "tasks", "marketing",
  "hr", "tickets", "finance", "procurement", "reports", "kpis", "access", "master", "integrations",
] as const;
export type ModuleKey = (typeof MODULES)[number];

export type DataScope = "own" | "team" | "dept" | "all";
const SCOPE_RANK: Record<DataScope, number> = { own: 0, team: 1, dept: 2, all: 3 };

export interface RolePolicy {
  readonly scope: DataScope;
  readonly modules: Partial<Record<ModuleKey, readonly Action[]>>;
}

export interface Grants {
  readonly scope: DataScope;
  can(module: ModuleKey, action: Action): boolean;
  actions(module: ModuleKey): ReadonlySet<Action>;
}

/** Any action implies view (you can't edit what you can't see). */
const withView = (set: Set<Action>): Set<Action> => (set.size ? set.add("view") : set);

/** The canonical form of one module's actions: no duplicates, view added when anything is granted, fixed order. */
export const normalizeActions = (actions: readonly Action[]): Action[] => {
  const set = withView(new Set(actions));
  return ACTIONS.filter((a) => set.has(a));
};

export function effectiveGrants(
  roles: readonly RolePolicy[],
  overrides: Partial<Record<ModuleKey, readonly Action[]>> = {},
): Grants {
  const per = new Map<ModuleKey, Set<Action>>();
  for (const m of MODULES) {
    const o = overrides[m];
    per.set(m, withView(new Set(o ?? roles.flatMap((r) => r.modules[m] ?? []))));
  }
  const scope = roles.reduce<DataScope>((best, r) => (SCOPE_RANK[r.scope] > SCOPE_RANK[best] ? r.scope : best), "own");
  return {
    scope,
    can: (m, a) => per.get(m)?.has(a) ?? false,
    actions: (m) => per.get(m) ?? new Set(),
  };
}

/**
 * Whoever manages permissions can't take that right away from themselves (would lock everyone out).
 * Returns true when the proposed change is allowed.
 */
export const keepsAccessAdmin = (after: Grants): boolean => after.can("access", "edit");

/** M-09 2.4: a new sign-in code can be asked for one minute after the last one was sent. */
export const OTP_RESEND_SECONDS = 60;
/** Seconds left before another code may be sent (0 = now). */
export const otpResendWait = (sentAt: Date, now: Date): number =>
  Math.max(0, Math.ceil(OTP_RESEND_SECONDS - (now.getTime() - sentAt.getTime()) / 1000));
