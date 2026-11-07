"use client";
import { useQuery } from "@tanstack/react-query";
import { canEditSetting, fieldAccess, type Action, type FieldMode, type FieldRules, type ModuleKey } from "@places/domain";
import { api } from "./api";

export interface Me { id: string; name: string; email: string; emailNotifications: boolean; roles: string[]; roleLabels: string[]; scope: string; permissions: Partial<Record<ModuleKey, Action[]>>; fields: FieldRules }

/** The signed-in person and what they may do. Hiding buttons is for comfort; the API checks every call. */
export function useMe() {
  const q = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me"), staleTime: 60_000 });
  const can = (m: ModuleKey, a: Action = "view") => !!q.data?.permissions[m]?.includes(a);
  /** M-13 4.1: may change this setting (its department's manager, the Super Admin) — the API checks the same rule. */
  const canSet = (key: string) => !!q.data && canEditSetting(key, { roles: q.data.roles, masterEdit: can("master", "edit"), accessEdit: can("access", "edit") });
  return { me: q.data, can, canSet, loading: q.isPending };
}

/**
 * M-09 field permissions for one module: what the person sees of each field (the API already blanks the hidden ones and
 * keeps the read-only ones on save): `hidden` = columns, rows and inputs to leave out; `edits(key)` = an input not locked.
 */
export function useFields(module: ModuleKey): { mode: (key: string) => FieldMode; hidden: ReadonlySet<string>; shows: (key: string) => boolean; edits: (key: string) => boolean } {
  const { me } = useMe();
  const a = fieldAccess(me?.fields ?? {});
  const hidden = a.hidden(module), fixed = a.fixed(module);
  return { mode: (k) => a.mode(module, k), hidden, shows: (k) => !hidden.has(k), edits: (k) => !fixed.has(k) };
}
