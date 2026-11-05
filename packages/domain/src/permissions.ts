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

/** The screen names of the modules and actions (the demo's wording), shared by the web app and the Excel reports. */
export const MODULE_LABEL: Record<ModuleKey, string> = {
  home: "الرئيسية", leads: "العملاء المحتملين", deals: "الصفقات", settings: "إعدادات التوزيع", clients: "العملاء والملاك",
  contracts: "العقود والتحصيل", inventory: "مخزون الوحدات", notactive: "Not Active", tasks: "المهام", marketing: "التسويق",
  hr: "الموارد البشرية", tickets: "التذاكر", finance: "المالية", procurement: "المشتريات", reports: "التقارير والتارجت",
  kpis: "مؤشرات الأداء", access: "الأدوار والصلاحيات", master: "الإعدادات", integrations: "الإشعارات والإيميل",
};
export const ACTION_LABEL: Record<Action, string> = { view: "يشوف", create: "يضيف", edit: "يعدّل", approve: "يوافق", delete: "يأرشف / يمسح", import: "يستورد", export: "يصدّر" };

/** The Audit Log's actions in words (screen and Excel). */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "إضافة", update: "تعديل", delete: "مسح", login: "دخول", locked: "اتقفل (5 محاولات غلط)", unlock: "فتح الحساب", disable: "إيقاف",
  enable: "تفعيل", activated: "فعّل حسابه", "password-reset": "غيّر الباسورد (لينك)", "password-changed": "غيّر الباسورد", permissions: "تعديل المصفوفة",
  "invite-resent": "إعادة إيميل التفعيل", "reset-sent": "إرسال لينك تغيير الباسورد", export: "تصدير", import: "استيراد",
  "handover-asked": "طلب نقل شغل", "handover-approved": "موافقة على نقل شغل", "handover-rejected": "رفض نقل شغل", reassign: "نقل",
};

/** M-09 1.2 · 4.1: the role whose permission edits stop at his own team. */
export const OPS_HEAD = "opshead";

/**
 * Everyone under a manager in the org structure (M-09 7.2 · `managerId`), at any depth: his reports, their
 * reports… Never the manager himself, and a loop in the data can't hang it.
 */
export function teamUnder(managerId: string, people: readonly { id: string; managerId: string | null }[]): Set<string> {
  const team = new Set<string>();
  let frontier = [managerId];
  while (frontier.length) {
    const next = people.filter((p) => p.managerId !== null && frontier.includes(p.managerId) && p.id !== managerId && !team.has(p.id)).map((p) => p.id);
    for (const id of next) team.add(id);
    frontier = next;
  }
  return team;
}

/**
 * M-09 2.2 · 4.1: the Operations Head changes his team's permissions «في حدود دوره»: a module he touches must hold
 * only actions he has himself, before and after the change. So he can't hand out, or take away, what he doesn't
 * have (management and finance stay out of his reach).
 */
export const withinOwnPermissions = (mine: Grants, module: ModuleKey, before: readonly Action[], after: readonly Action[]): boolean =>
  [...before, ...after].every((a) => mine.can(module, a));

/**
 * M-09 2.2 · 7.1 «موظف مشي: الحساب يتقفل، والليدز بتاعته تتنقل بموافقة مديره»: why a request to move a leaver's
 * open work can't be made, or null. The leaver is stopped (or has a last working day); the work goes to someone
 * else whose account works; and there is a direct manager to approve it.
 */
export function handoverRefusal(h: { leaving: boolean; managerUserId: string | null; fromId: string; toId: string; toActive: boolean; pending: boolean }): string | null {
  if (!h.leaving) return "الحساب لسه شغال · وقّفه أو حدد آخر يوم شغل الأول";
  if (h.pending) return "فيه طلب نقل مستني موافقة المدير بالفعل";
  if (!h.managerUserId) return "مفيش مدير مباشر للموظف ده يوافق على النقل";
  if (h.toId === h.fromId) return "اختار حد تاني غير الموظف نفسه";
  if (!h.toActive) return "اللي هيستلم الشغل لازم حسابه يكون شغال";
  return null;
}
