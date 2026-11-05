/**
 * M-13 2.1 · 3.3 · the lists the screens are built on (areas, channels, finishing…). A value used in old records is
 * switched off («موقوف») instead of deleted, so old records and reports keep it; and the values the system posts
 * or calculates on (accountant meeting, 4 Nov: «عمولة من عميل») stay on.
 */
export interface ListValue { readonly value: string; readonly active: boolean }

/** Why a list can't be saved like that (Arabic, shown as is), or null when it can. */
export function listChangeProblem(before: readonly ListValue[], after: readonly ListValue[], locked: readonly string[] = []): string | null {
  const now = new Map(after.map((i) => [i.value, i]));
  const removed = before.find((i) => !now.has(i.value));
  if (removed) return `«${removed.value}» ماتتمسحش · وقّفها بدل ما تشيلها، عشان البيانات القديمة`;
  const off = locked.find((v) => now.get(v)?.active === false || (!now.has(v) && before.some((i) => i.value === v)));
  if (off) return `«${off}» السيستم بيحسب عليها · ماتتوقفش`;
  return null;
}

/** A list saved before values could be switched off (plain text) as the current shape: every value active. */
export const asListValues = (raw: unknown): ListValue[] =>
  Array.isArray(raw) ? raw.map((x) => (typeof x === "string" ? { value: x, active: true } : (x as ListValue))) : [];

/** The values a form may store: the active ones, plus the one the record already has (it may have been switched off since). */
export function allowedValue(items: readonly ListValue[], value: string, current: string | null = null): boolean {
  return value === current || items.some((i) => i.active && i.value === value);
}

/**
 * Who changes which list (client's answer on #186): per list, the roles / people (user ids) that may add a value and
 * the ones that may switch values off and back on. A list nobody has set up yet stays with «master: edit».
 */
export type ListAction = "add" | "off";
export type ListEditorsOf = Readonly<Record<ListAction, readonly string[]>>;

/** What a save does: adds a new value, and / or switches values off or back on (a list is never renamed or shortened). */
export function listActions(before: readonly ListValue[], after: readonly ListValue[]): ListAction[] {
  const was = new Map(before.map((i) => [i.value, i.active]));
  const out = new Set<ListAction>();
  for (const i of after) {
    if (!was.has(i.value)) out.add("add");
    else if (was.get(i.value) !== i.active) out.add("off");
  }
  return [...out];
}

export function canChangeList(rule: ListEditorsOf | undefined, action: ListAction, me: { id: string; roles: readonly string[]; masterEdit: boolean }): boolean {
  if (!rule) return me.masterEdit;
  return rule[action].some((x) => x === me.id || me.roles.includes(x));
}

/** The Super Admin role: changes every setting (M-13 4.1), and is the only one for the money rules (M-13 2.2). */
export const SUPER_ADMIN_ROLE = "admin";

/**
 * M-13 1.2 · 2.2 · 3.1 · 4.1: whose setting each one is. A department manager changes his own department's only
 * (the HR: leave types and official holidays · the marketing: the channels and the WhatsApp limit · Manar's area
 * tabs live in the inventory, under «inventory: edit»). The money rules and what the requirements give the Super
 * Admin are his alone; «access» = whoever manages roles and permissions (#186 · 1.25). A key not in the map keeps
 * «master: edit» until the client names its department.
 */
export type SettingOwner = readonly string[] | "super" | "access";
export const SETTING_OWNERS: Readonly<Record<string, SettingOwner>> = {
  leaveTypes: ["hr"],
  holidays: ["hr"],
  channels: ["marketing"],
  whatsappDailyLimit: ["marketing"],
  areas: "super", // 3.1: «المناطق · Super Admin»
  notificationsFrom: "super", // M-14: «Super Admin (الإعداد)»
  procurementBigApprovers: "super", // money: who approves above 50,000 (2.2 · M-08 Q44)
  tlTiers: "super", // money: the TL's commission tiers (M-12 2.1 step 5 «الإدارة»)
  opsCommissionPct: "super", // money: 9.6 a deal's operations / external commission rates
  externalCommissionPct: "super",
  leadLogRoles: "access",
  listEditors: "access",
};

export interface SettingEditor { readonly roles: readonly string[]; readonly masterEdit: boolean; readonly accessEdit: boolean }

/** May this person change this setting? For a list, this is who changes it until its own editors are set up (#186). */
export function canEditSetting(key: string, me: SettingEditor): boolean {
  const owner = SETTING_OWNERS[key];
  if (owner === "access") return me.accessEdit;
  if (me.roles.includes(SUPER_ADMIN_ROLE)) return true;
  if (owner === "super") return false;
  if (owner) return me.masterEdit && me.roles.some((r) => owner.includes(r));
  return me.masterEdit;
}

/** «مين يعدّل»'s starting point for a list not set up yet: its department and the Super Admin, else today's «master: edit» roles. */
export function defaultListEditors(key: string, masterEditRoles: readonly string[]): string[] {
  const owner = SETTING_OWNERS[key];
  if (owner === "super") return [SUPER_ADMIN_ROLE];
  if (typeof owner === "object") return [SUPER_ADMIN_ROLE, ...owner];
  return [...masterEditRoles];
}
