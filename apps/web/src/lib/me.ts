"use client";
import { useQuery } from "@tanstack/react-query";
import { canEditSetting, type Action, type ModuleKey } from "@places/domain";
import { api } from "./api";

export interface Me { id: string; name: string; email: string; emailNotifications: boolean; roles: string[]; roleLabels: string[]; scope: string; permissions: Partial<Record<ModuleKey, Action[]>> }

/** The signed-in person and what they may do. Hiding buttons is for comfort; the API checks every call. */
export function useMe() {
  const q = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me"), staleTime: 60_000 });
  const can = (m: ModuleKey, a: Action = "view") => !!q.data?.permissions[m]?.includes(a);
  /** M-13 4.1: may change this setting (its department's manager, the Super Admin) — the API checks the same rule. */
  const canSet = (key: string) => !!q.data && canEditSetting(key, { roles: q.data.roles, masterEdit: can("master", "edit"), accessEdit: can("access", "edit") });
  return { me: q.data, can, canSet, loading: q.isPending };
}
